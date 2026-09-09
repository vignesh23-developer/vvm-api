import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { QueryFailedError } from 'typeorm';

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error: string | undefined;
    let details: any = undefined;

    // Handle HTTP Exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        message = response;
      } else if (response && typeof response === 'object') {
        const r = response as Record<string, any>;
        message = r.message || r.error || message;
        error = r.error;
        if (r.message && Array.isArray(r.message)) {
          details = r.message;
        }
      }
    }
    // Handle Database Errors
    else if (exception instanceof QueryFailedError) {
      const dbError = this.handleDatabaseError(exception);
      status = dbError.status;
      message = dbError.message;
      error = dbError.error;
    }
    // Handle generic errors
    else if (exception instanceof Error) {
      message = 'Internal server error';
    }

    const requestId =
      (req.headers['x-request-id'] as string) ||
      res.getHeader?.('x-request-id') ||
      undefined;

    // Prepare log context
    const logContext = {
      requestId,
      status,
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip,
      user: req.user
        ? { id: req.user.sub || req.user.id, roles: req.user.roles }
        : undefined,
      err:
        exception instanceof Error
          ? {
              name: exception.name,
              message: exception.message,
              stack: exception.stack
            }
          : exception
    };

    this.logger.error(
      logContext,
      `[${req.method}] ${req.originalUrl || req.url} -> ${message}`
    );

    // Build response body
    const isDev = (process.env.NODE_ENV || 'development') === 'development';
    const body: any = {
      statusCode: status,
      message,
      path: req.originalUrl || req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
      requestId
    };

    if (error) {
      body.error = error;
    }

    if (details) {
      body.details = details;
    }

    // Show stack trace only in development
    if (
      isDev &&
      exception instanceof Error &&
      !(exception instanceof QueryFailedError)
    ) {
      body.debug = { name: exception.name, stack: exception.stack };
    }

    res.status(status).json(body);
  }

  private handleDatabaseError(exception: QueryFailedError): {
    status: number;
    message: string;
    error: string;
  } {
    const driverError = exception.driverError as any;
    const code = driverError?.code;
    const detail = driverError?.detail || '';
    const constraint = driverError?.constraint || '';
    const column = driverError?.column;

    switch (code) {
      // Unique Violation
      case '23505': {
        const field = this.extractFieldFromDetail(detail);
        return {
          status: HttpStatus.CONFLICT,
          message: field
            ? `A record with this ${field} already exists`
            : 'A record with this value already exists',
          error: 'Duplicate Entry'
        };
      }

      // Foreign Key Violation
      case '23503': {
        const refInfo = this.extractForeignKeyInfo(detail, constraint);
        return {
          status: HttpStatus.BAD_REQUEST,
          message: refInfo || 'Referenced record does not exist',
          error: 'Invalid Reference'
        };
      }

      // Not Null Violation
      case '23502': {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: column
            ? `${this.formatFieldName(column)} is required`
            : 'A required field is missing',
          error: 'Validation Error'
        };
      }

      // Check Constraint Violation
      case '23514': {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'The provided value does not meet the required constraints',
          error: 'Validation Error'
        };
      }

      // String Data Right Truncation
      case '22001': {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'One or more values exceed the maximum allowed length',
          error: 'Validation Error'
        };
      }

      // Invalid Text Representation (invalid UUID, enum, etc.)
      case '22P02': {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid data format provided',
          error: 'Validation Error'
        };
      }

      // Numeric Value Out of Range
      case '22003': {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Numeric value is out of allowed range',
          error: 'Validation Error'
        };
      }

      // Foreign Key Violation on Delete (restrict)
      case '23504': {
        return {
          status: HttpStatus.CONFLICT,
          message:
            'Cannot delete this record as it is referenced by other records',
          error: 'Delete Restricted'
        };
      }

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'A database error occurred',
          error: 'Database Error'
        };
    }
  }

  // Extract field name from: "Key (name)=(Area Details chen) already exists."
  private extractFieldFromDetail(detail: string): string | null {
    const match = detail.match(/Key \(([^)]+)\)/);
    if (match) {
      // Handle composite keys: (field1, field2) -> "field1 and field2"
      const fields = match[1]
        .split(',')
        .map((f) => this.formatFieldName(f.trim()));
      return fields.join(' and ');
    }
    return null;
  }

  // Extract info from FK violation
  // e.g., "Key (city_id)=(123) is not present in table \"cities\"."
  private extractForeignKeyInfo(
    detail: string,
    constraint: string
  ): string | null {
    const tableMatch = detail.match(/is not present in table "(\w+)"/);
    const keyMatch = detail.match(/Key \(([^)]+)\)/);

    if (tableMatch) {
      const table = this.formatFieldName(tableMatch[1].replace(/s$/, '')); // Remove plural 's'
      return `The specified ${table} does not exist`;
    }

    if (keyMatch) {
      const field = this.formatFieldName(keyMatch[1]);
      return `Invalid ${field} reference`;
    }

    return null;
  }

  // Convert snake_case/camelCase to "Title Case"
  private formatFieldName(field: string): string {
    return field
      .replace(/_id$/i, '') // Remove _id suffix
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  }
}

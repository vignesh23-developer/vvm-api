export const formatPhoneNumber = (phone: string) => {

  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`;
  }

  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`;
  }

  return cleaned;
};

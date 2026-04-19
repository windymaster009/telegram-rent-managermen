const validator = require('validator');

function validateRoomNumber(roomNumber) {
  return typeof roomNumber === 'string' && /^[A-Za-z0-9-]{1,10}$/.test(roomNumber.trim());
}

function validatePhone(phone) {
  return typeof phone === 'string' && validator.isMobilePhone(phone, 'any');
}

module.exports = { validateRoomNumber, validatePhone };

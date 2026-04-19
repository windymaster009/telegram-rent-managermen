const { connectDb } = require('../config/db');
const roomService = require('../services/roomService');
const tenantService = require('../services/tenantService');

async function seedSampleData() {
  await connectDb();

  const sampleRooms = [
    { roomNumber: 'A101', rentPrice: 650, notes: 'Balcony' },
    { roomNumber: 'A102', rentPrice: 600, notes: '' }
  ];

  for (const room of sampleRooms) {
    try {
      await roomService.addRoom(room);
    } catch (_) {}
  }

  try {
    await tenantService.addTenantToRoom({
      roomNumber: 'A101',
      fullName: 'John Doe',
      phone: '+15551234567',
      telegramUsername: 'john_doe',
      moveInDate: '2026-01-10'
    });
  } catch (_) {}

  console.log('Sample data seeded.');
  process.exit(0);
}

seedSampleData().catch((error) => {
  console.error(error);
  process.exit(1);
});

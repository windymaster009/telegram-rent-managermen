const { connectDb } = require('../config/db');
const Room = require('../models/Room');
const { addRoom } = require('../services/roomService');

async function seedRooms() {
  await connectDb();

  // Recreate room inventory from scratch to match current room creation rule/format.
  await Room.deleteMany({});

  const created = [];
  for (let i = 1; i <= 10; i += 1) {
    const roomNumber = `A${String(i).padStart(2, '0')}`;
    const room = await addRoom({
      roomNumber,
      rentPrice: 500,
      notes: ''
    });
    created.push(room.roomNumber);
  }

  console.log(`Seeded ${created.length} rooms: ${created.join(', ')}`);
  process.exit(0);
}

seedRooms().catch((error) => {
  console.error(error);
  process.exit(1);
});

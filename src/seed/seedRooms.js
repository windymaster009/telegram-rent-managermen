const { connectDb } = require('../config/db');
const Room = require('../models/Room');

async function seedRooms() {
  await connectDb();

  const bulk = [];
  for (let i = 1; i <= 100; i += 1) {
    const roomNumber = String(i).padStart(3, '0');
    bulk.push({
      updateOne: {
        filter: { roomNumber },
        update: {
          $setOnInsert: {
            roomNumber,
            status: 'free',
            rentPrice: 500,
            tenantId: null,
            notes: ''
          }
        },
        upsert: true
      }
    });
  }

  await Room.bulkWrite(bulk);
  console.log('Seeded 100 rooms.');
  process.exit(0);
}

seedRooms().catch((error) => {
  console.error(error);
  process.exit(1);
});

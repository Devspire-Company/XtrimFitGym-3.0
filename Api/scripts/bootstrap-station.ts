import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { Account, AttendanceStation } from '../src/models.js';

async function main() {
  const [stationId, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ');
  if (!stationId || stationId.length < 8 || !name) throw new Error('Usage: npm run bootstrap:station -- <station-id-at-least-8-chars> <station-name>');
  await connectDatabase();
  const owner = await Account.findOne({ role: 'OWNER', isActive: true });
  if (!owner) throw new Error('Create the owner account first.');
  await AttendanceStation.create({ stationId, name, createdBy: owner._id });
  console.log(`Attendance station created: ${name} (${stationId})`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(disconnectDatabase);


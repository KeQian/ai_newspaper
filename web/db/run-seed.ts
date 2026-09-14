import { parseDatabaseEnvironment } from './env';
import { seedReferenceData } from './seed';

const { DATABASE_URL } = parseDatabaseEnvironment(process.env);

await seedReferenceData(DATABASE_URL);
console.log('Reference data seeded.');

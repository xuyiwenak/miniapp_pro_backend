import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { loadConfig } from './config';
import { SmartCourseMongoComponent } from './component/SmartCourseMongoComponent';
import { requireValue } from './errors';

const BCRYPT_ROUNDS = 12;
async function main() {
  const username = z.string().trim().min(3).max(80).parse(process.env.SMARTCOURSE_TEACHER_USERNAME);
  const password = z.string().min(12).max(72).parse(process.env.SMARTCOURSE_TEACHER_PASSWORD);
  const mongo = new SmartCourseMongoComponent(loadConfig());
  try {
    await mongo.start();
    await requireValue(mongo.models).teachers.create({ teacherId: randomUUID(), username,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) });
    console.info('smartCourse teacher created');
  } finally { await mongo.stop(); }
}
main().catch(() => {
  console.error('Teacher creation failed; check input or duplicate username');
  process.exitCode = 1;
});

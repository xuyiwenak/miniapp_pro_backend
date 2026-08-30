import { strict as assert } from 'assert';
import { ClassroomSchema } from '../../src/apps/mandis/entity/classroom.entity';
import { TeacherProfileSchema } from '../../src/apps/mandis/entity/teacherProfile.entity';

describe('teacher ownership schemas', () => {
  it('uses a dedicated teacher profile identity', () => {
    assert.equal(TeacherProfileSchema.path('teacherId').options.unique, true);
    assert.equal(TeacherProfileSchema.path('userId').options.unique, true);
    assert.deepEqual(TeacherProfileSchema.path('status').options.enum, [
      'active',
      'suspended',
    ]);
  });

  it('owns classrooms by teacher identity instead of administrator identity', () => {
    assert.ok(ClassroomSchema.path('createdByTeacherId'));
    assert.equal(ClassroomSchema.path('createdByAdminId'), undefined);
  });
});

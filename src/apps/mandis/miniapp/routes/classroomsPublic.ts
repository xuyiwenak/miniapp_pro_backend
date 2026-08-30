import { Router } from 'express';
import { getClassroomModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import type { IClassroom } from '../../entity/classroom.entity';
import {
  sendErr,
  sendSucc,
} from '../../../../shared/miniapp/middleware/response';

const router = Router();

function mapPublicClassroom(classroom: IClassroom): Record<string, unknown> {
  return {
    courseName: classroom.courseName,
    sessionTitle: classroom.sessionTitle,
    activityTheme: classroom.activityTheme,
    classDate: classroom.classDate,
    startTime: classroom.startTime,
    endTime: classroom.endTime,
    timezone: classroom.timezone,
    gradeLevel: classroom.gradeLevel,
    teacherDisplayName: classroom.teacherDisplayName,
    locationText: classroom.locationText,
    status: classroom.status,
  };
}

router.get('/:accessCode', async (req, res) => {
  const accessCode = req.params.accessCode?.trim();
  if (!accessCode) {
    sendErr(res, 'Invalid classroom link', 400);
    return;
  }
  const Classroom = getClassroomModel();
  const classroom = await Classroom.findOne({ accessCode }).lean().exec();
  if (!classroom) {
    sendErr(res, 'Classroom not found', 404);
    return;
  }
  sendSucc(res, mapPublicClassroom(classroom));
});

export default router;

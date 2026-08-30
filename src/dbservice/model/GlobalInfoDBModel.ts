/*
 * @Author: lyh
 * @Github:
 * @FilePath: /InstanceServer/src/dbservice/model/GlobalInfoDBModel.ts
 * @Date: 2024-10-25 09:22:33
 * @LastEditors: lyh
 * @LastEditTime: 2024-11-28 10:35:50
 */
import { Connection, Model } from 'mongoose';
import { IPersonalInfo, PersonalInfoSchema } from '../../entity/personalInfo.entity';
import { IWork, WorkSchema } from '../../entity/work.entity';
import { FeedbackSchema, type IFeedback } from '../../entity/feedback.entity';
import { IMandisAdmin, MandisAdminSchema } from '../../apps/mandis/entity/mandisAdmin.entity';
import { IUserTips, UserTipsSchema } from '../../entity/userTips.entity';
import {
  EmailTemplateConfigSchema,
  type IEmailTemplateConfig,
} from '../../apps/mandis/entity/emailTemplateConfig.entity';
import { ClassroomSchema, type IClassroom } from '../../apps/mandis/entity/classroom.entity';
import {
  ClassroomParticipationSchema,
  type IClassroomParticipation,
} from '../../apps/mandis/entity/classroomParticipation.entity';
import {
  TeacherProfileSchema,
  type ITeacherProfile,
} from '../../apps/mandis/entity/teacherProfile.entity';

class GlobalModelManager {
  private connection: Connection;
  private workModel!: Model<IWork>;
  private personalInfoModel!: Model<IPersonalInfo>;
  private feedbackModel!: Model<IFeedback>;
  private mandisAdminModel!: Model<IMandisAdmin>;
  private userTipsModel!: Model<IUserTips>;
  private emailTemplateConfigModel!: Model<IEmailTemplateConfig>;
  private classroomModel!: Model<IClassroom>;
  private classroomParticipationModel!: Model<IClassroomParticipation>;
  private teacherProfileModel!: Model<ITeacherProfile>;

  constructor(connection: Connection) {
    this.connection = connection;
    this.registerModels();
  }

  private registerModels() {
    this.workModel = this.connection.model<IWork>('Work', WorkSchema);
    this.workModel.createIndexes().catch(() => {});

    this.personalInfoModel = this.connection.model<IPersonalInfo>('PersonalInfo', PersonalInfoSchema);
    this.personalInfoModel.createIndexes().catch(() => {});

    this.feedbackModel = this.connection.model<IFeedback>('Feedback', FeedbackSchema);
    this.feedbackModel.createIndexes().catch(() => {});

    this.mandisAdminModel = this.connection.model<IMandisAdmin>('MandisAdmin', MandisAdminSchema);
    this.mandisAdminModel.createIndexes().catch(() => {});

    this.userTipsModel = this.connection.model<IUserTips>('UserTips', UserTipsSchema);
    this.userTipsModel.createIndexes().catch(() => {});

    this.emailTemplateConfigModel = this.connection.model<IEmailTemplateConfig>(
      'EmailTemplateConfig',
      EmailTemplateConfigSchema,
    );
    this.emailTemplateConfigModel.createIndexes().catch(() => {});

    this.classroomModel = this.connection.model<IClassroom>('Classroom', ClassroomSchema);
    this.classroomModel.createIndexes().catch(() => {});

    this.classroomParticipationModel = this.connection.model<IClassroomParticipation>(
      'ClassroomParticipation',
      ClassroomParticipationSchema,
    );
    this.classroomParticipationModel.createIndexes().catch(() => {});
    this.teacherProfileModel = this.connection.model<ITeacherProfile>('TeacherProfile', TeacherProfileSchema);
    this.teacherProfileModel.createIndexes().catch(() => {});
  }

  public getWorkModel(): Model<IWork> {
    return this.workModel;
  }

  public getPersonalInfoModel(): Model<IPersonalInfo> {
    return this.personalInfoModel;
  }

  public getFeedbackModel(): Model<IFeedback> {
    return this.feedbackModel;
  }

  public getMandisAdminModel(): Model<IMandisAdmin> {
    return this.mandisAdminModel;
  }

  public getUserTipsModel(): Model<IUserTips> {
    return this.userTipsModel;
  }

  public getEmailTemplateConfigModel(): Model<IEmailTemplateConfig> {
    return this.emailTemplateConfigModel;
  }

  public getClassroomModel(): Model<IClassroom> {
    return this.classroomModel;
  }

  public getClassroomParticipationModel(): Model<IClassroomParticipation> {
    return this.classroomParticipationModel;
  }

  public getTeacherProfileModel(): Model<ITeacherProfile> {
    return this.teacherProfileModel;
  }

  public async stopConnection() {
    return this.connection.destroy();
  }
}

let globalModelManager: GlobalModelManager;

export function initializeGlobalModel(connection: Connection) {
  if (!globalModelManager) {
    globalModelManager = new GlobalModelManager(connection);
  }
  return globalModelManager;
}

export function getGlobalModelManager(): GlobalModelManager {
  if (!globalModelManager) {
    throw new Error(
      'GlobalModelManager is not initialized. Please call initializeGlobalModel first.',
    );
  }
  return globalModelManager;
}

export function getWorkModel(): Model<IWork> {
  return getGlobalModelManager().getWorkModel();
}

export function getPersonalInfoModel(): Model<IPersonalInfo> {
  return getGlobalModelManager().getPersonalInfoModel();
}

export function getFeedbackModel(): Model<IFeedback> {
  return getGlobalModelManager().getFeedbackModel();
}

export function getMandisAdminModel(): Model<IMandisAdmin> {
  return getGlobalModelManager().getMandisAdminModel();
}

export function getUserTipsModel(): Model<IUserTips> {
  return getGlobalModelManager().getUserTipsModel();
}

export function getEmailTemplateConfigModel(): Model<IEmailTemplateConfig> {
  return getGlobalModelManager().getEmailTemplateConfigModel();
}

export function getClassroomModel(): Model<IClassroom> {
  return getGlobalModelManager().getClassroomModel();
}

export function getClassroomParticipationModel(): Model<IClassroomParticipation> {
  return getGlobalModelManager().getClassroomParticipationModel();
}

export function getTeacherProfileModel(): Model<ITeacherProfile> {
  return getGlobalModelManager().getTeacherProfileModel();
}

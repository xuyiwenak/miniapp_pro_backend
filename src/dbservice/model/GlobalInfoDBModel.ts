/*
 * @Author: lyh
 * @Github:
 * @FilePath: /InstanceServer/src/dbservice/model/GlobalInfoDBModel.ts
 * @Date: 2024-10-25 09:22:33
 * @LastEditors: lyh
 * @LastEditTime: 2024-11-28 10:35:50
 */
import { Connection, Model } from "mongoose";
import { IPersonalInfo, PersonalInfoSchema } from "../../entity/personalInfo.entity";
import { IWork, WorkSchema } from "../../entity/work.entity";
import { FeedbackSchema, type IFeedback } from "../../entity/feedback.entity";

class GlobalModelManager {
  private connection: Connection;
  private workModel!: Model<IWork>;
  private personalInfoModel!: Model<IPersonalInfo>;
  private feedbackModel!: Model<IFeedback>;

  constructor(connection: Connection) {
    this.connection = connection;
    this.registerModels();
  }

  private registerModels() {
    this.workModel = this.connection.model<IWork>("Work", WorkSchema);
    this.workModel.createIndexes().catch(() => {});

    this.personalInfoModel = this.connection.model<IPersonalInfo>("PersonalInfo", PersonalInfoSchema);
    this.personalInfoModel.createIndexes().catch(() => {});

    this.feedbackModel = this.connection.model<IFeedback>("Feedback", FeedbackSchema);
    this.feedbackModel.createIndexes().catch(() => {});
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
      "GlobalModelManager is not initialized. Please call initializeGlobalModel first.",
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

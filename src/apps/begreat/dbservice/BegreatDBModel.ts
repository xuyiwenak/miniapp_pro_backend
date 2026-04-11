import { Connection, Model } from "mongoose";
import { IQuestion, QuestionSchema } from "../entity/question.entity";
import { IOccupationNorm, OccupationSchema } from "../entity/occupation.entity";
import { IAssessmentSession, SessionSchema } from "../entity/session.entity";
import { INormEntry, NormSchema } from "../entity/norm.entity";

class BegreatModelManager {
  private questionModel!:   Model<IQuestion>;
  private occupationModel!: Model<IOccupationNorm>;
  private sessionModel!:    Model<IAssessmentSession>;
  private normModel!:       Model<INormEntry>;

  constructor(connection: Connection) {
    this.questionModel   = connection.model<IQuestion>("Question", QuestionSchema);
    this.occupationModel = connection.model<IOccupationNorm>("OccupationNorm", OccupationSchema);
    this.sessionModel    = connection.model<IAssessmentSession>("AssessmentSession", SessionSchema);
    this.normModel       = connection.model<INormEntry>("Norm", NormSchema);

    this.questionModel.createIndexes().catch(() => {});
    this.occupationModel.createIndexes().catch(() => {});
    this.sessionModel.createIndexes().catch(() => {});
    this.normModel.createIndexes().catch(() => {});
  }

  getQuestionModel()   { return this.questionModel; }
  getOccupationModel() { return this.occupationModel; }
  getSessionModel()    { return this.sessionModel; }
  getNormModel()       { return this.normModel; }

  async stopConnection(conn: Connection) {
    return conn.destroy();
  }
}

let manager: BegreatModelManager;
let _connection: Connection;

export function initializeBegreatModels(connection: Connection) {
  if (!manager) {
    manager  = new BegreatModelManager(connection);
    _connection = connection;
  }
  return manager;
}

export function getBegreatModelManager(): BegreatModelManager {
  if (!manager) throw new Error("BegreatModels not initialized");
  return manager;
}

export function getQuestionModel()   { return getBegreatModelManager().getQuestionModel(); }
export function getOccupationModel() { return getBegreatModelManager().getOccupationModel(); }
export function getSessionModel()    { return getBegreatModelManager().getSessionModel(); }
export function getNormModel()       { return getBegreatModelManager().getNormModel(); }

export async function stopBegreatConnection() {
  if (manager && _connection) {
    return _connection.destroy();
  }
}

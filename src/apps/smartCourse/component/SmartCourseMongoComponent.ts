import type { Connection } from 'mongoose';
import type { IBaseComponent } from '../../../common/BaseComponent';
import { BaseMongoComponent } from '../../../component/mongo/BaseMongoComponent';
import { createModels, type Models } from '../dbservice/models';
import type { SmartCourseConfig } from '../config';

export class SmartCourseMongoComponent extends BaseMongoComponent implements IBaseComponent {
  private connection?: Connection;
  models?: Models;
  constructor(private config: SmartCourseConfig) { super(); }
  async start() {
    const c = this.config;
    await this.connectDb({ host: c.SMARTCOURSE_DB_HOST, port: c.SMARTCOURSE_DB_PORT, db: c.SMARTCOURSE_DB_NAME,
      user: c.SMARTCOURSE_DB_USER, password: c.SMARTCOURSE_DB_PASSWORD, authSource: c.SMARTCOURSE_DB_AUTH_SOURCE }, {
      connectedLog: '[smartCourse] Mongo connected', errorLog: '[smartCourse] Mongo error',
      disconnectedLog: '[smartCourse] Mongo disconnected', reconnectedLog: '[smartCourse] Mongo reconnected',
      onConnected: async connection => {
        this.connection = connection;
        this.models = createModels(connection);
        await Promise.all(Object.values(this.models).map(model => model.createIndexes()));
      },
    });
  }
  async stop() { await this.connection?.close(); }
}

import type {
  IEmailTemplateConfig,
  IEmailTemplateContent,
  IEmailTemplateStyle,
} from '../../apps/mandis/entity/emailTemplateConfig.entity';
import { getEmailTemplateConfigModel } from './GlobalInfoDBModel';

export interface EmailTemplateConfigInput {
  zhCn: IEmailTemplateContent;
  en: IEmailTemplateContent;
  style: IEmailTemplateStyle;
}

const TEMPLATE_KEY = 'verification-code';

export class EmailTemplateConfigDBModel {
  public static async findVerificationTemplate(): Promise<IEmailTemplateConfig | null> {
    return getEmailTemplateConfigModel()
      .findOne({ templateKey: TEMPLATE_KEY })
      .lean<IEmailTemplateConfig>()
      .exec();
  }

  public static async saveVerificationTemplate(
    input: EmailTemplateConfigInput,
    updatedBy: string,
  ): Promise<IEmailTemplateConfig> {
    const saved = await getEmailTemplateConfigModel()
      .findOneAndUpdate(
        { templateKey: TEMPLATE_KEY },
        { $set: { ...input, updatedBy }, $setOnInsert: { templateKey: TEMPLATE_KEY } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .lean<IEmailTemplateConfig>()
      .exec();
    if (!saved) throw new Error('Failed to save email template configuration');
    return saved;
  }
}

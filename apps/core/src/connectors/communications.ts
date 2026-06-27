import { BaseRequester } from './base-requester.js';

type ComponentId = number;
type StudentIds = number;
export type UFProcessorEnrolled = Record<ComponentId, StudentIds[]>;

type SendAnnouncementParams = {
  courseIdentifier: number;
  season: string;
  message: string;
};

type SendAnnouncementResponse = {
  message: string;
};


export class CommunicationsConnector extends BaseRequester {

  constructor(globalTraceId?: string) {
    super(process.env.COMMUNICATIONS_URL, globalTraceId);
  }

  async sendLinkToValidate(
    link: string,
    disciplina_id: string
  ): Promise<unknown> {

    const response = await this.request<unknown>('groups/validate-link', {
      method: 'POST',
      body: { link, disciplina_id },
    });

    return response;

  }


  async sendAnnouncement(
    params: SendAnnouncementParams
  ) {
    const { courseIdentifier, season, message } = params;

    return this.request<SendAnnouncementResponse>('/groups/announcements', {
      method: 'POST',
      body: {
        courseIdentifier,
        season,
        message,
      },
    });

  }

}

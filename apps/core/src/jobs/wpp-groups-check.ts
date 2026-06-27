import { defineJob } from '@next/queues/client';

import { CommunicationsConnector } from '@/connectors/communications.js';
import { JOB_NAMES } from '@/constants.js';
import { ComponentModel } from '@/models/Component.js';

const WHATSAPP_SINGLETON_JOB_ID = 'wpp-groups-check-singleton';

const WHATSAPP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Cookie: 'wa_lang_pref=en; wa_ul=40102065-f4c6-4a5a-9cfa-4d6d63c14bc5',
};

const OG_TITLE_RE = /property="og:title"\s+content="([^"]*)"/;

async function validateGroupUrl(
  url: string
): Promise<'valid' | 'invalid' | 'error'> {
  try {
    const response = await fetch(url, { headers: WHATSAPP_HEADERS });
    const html = await response.text();
    const title = OG_TITLE_RE.exec(html)?.[1] ?? '';
    return title.length > 0 ? 'valid' : 'invalid';
  } catch {
    return 'error';
  }
}

function randomDelayMs(): number {
  const min = 3 * 60 * 1000;
  const max = 5 * 60 * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const wppGroupsCheckJob = defineJob(JOB_NAMES.WHATSAPP_GROUPS_CHECK).handler(
  async ({ app, manager }) => {
    const startedAt = Date.now();
    const season = '2026:2'; //TODO: add as currentQuad() when it is working properly
    const communicationsConnector = new CommunicationsConnector();

    const components = (await ComponentModel.find(
      {
        groupURL: { $exists: true, $ne: null },
        season,
      },
      { groupURL: 1, disciplina_id: 1 },
      { sort: { updatedAt: -1 } }
    )
      .lean()
      .exec()) as Array<{
      groupURL?: string | null;
      disciplina_id?: number | null;
    }>;

    app.log.info(
      { total: components.length },
      'dispatching group link validations'
    );

    const counts = { valid: 0, invalid: 0, error: 0 };

    for (let i = 0; i < components.length; i++) {
      const { groupURL, disciplina_id } = components[i];
      const disciplinaId = String(disciplina_id);
      const result = await validateGroupUrl(groupURL!);

      app.log.info({
        event: 'WHATSAPP_group_url_checked',
        groupUrl: groupURL,
        disciplina_id: disciplinaId,
        result,
        season,
      });

      counts[result]++;

      if (result === 'invalid') {
        try {
          await communicationsConnector.sendLinkToValidate(
            groupURL!,
            disciplinaId
          );
        } catch (error) {
          app.log.error(
            { groupUrl: groupURL, disciplina_id: disciplinaId, error },
            'failed to send invalid group link to communications'
          );
        }
      }

      if (i < components.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, randomDelayMs()));
      }
    }

    const duration_ms = Date.now() - startedAt;

    app.log.info({
      event: 'WHATSAPP_groups_check_completed',
      season,
      total: components.length,
      ...counts,
      duration_ms,
    });

    const queue = manager.getQueue(JOB_NAMES.WHATSAPP_GROUPS_CHECK);
    await queue?.add(
      JOB_NAMES.WHATSAPP_GROUPS_CHECK,
      {},
      { jobId: WHATSAPP_SINGLETON_JOB_ID }
    );

    return {
      success: true,
      total: components.length,
      ...counts,
      duration_ms,
    };
  }
).every('every week on Monday at 3am')

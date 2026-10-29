// Netlify event-triggered function: runs automatically after every verified Netlify Forms submission.
// Sends a WhatsApp alert for each new lead to IME's sales number through the WhatsApp Business Cloud API (Meta).
//
// It does nothing until these environment variables are set in Netlify (Site configuration > Environment variables):
//   WHATSAPP_TOKEN            Permanent system-user access token from Meta Business (keep secret; never commit it)
//   WHATSAPP_PHONE_NUMBER_ID  The sender's phone-number ID from the WhatsApp Business account
//   WHATSAPP_TEMPLATE         Name of an APPROVED message template with 4 body variables (example in README-NETLIFY.md)
//   WHATSAPP_TEMPLATE_LANG    Template language code, e.g. "en"
//   GRAPH_API_VERSION         Graph API version, e.g. "v21.0" (check Meta's docs for the current version)
//   LEAD_ALERT_TO             Main recipient, international format without "+": 60123010100
//   LEAD_ALERT_CC             Optional copies, comma-separated: 60166268869,60123226673
//
// Verify the request format against Meta's current WhatsApp Cloud API documentation before go-live.
// Email notifications are separate: set them in Netlify (Forms > Form notifications), no code needed.

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}').payload || {};
  } catch (e) {
    return { statusCode: 400, body: 'Bad payload' };
  }
  const d = payload.data || {};
  const env = process.env;
  const required = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE', 'WHATSAPP_TEMPLATE_LANG', 'GRAPH_API_VERSION', 'LEAD_ALERT_TO'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    console.log('WhatsApp alert skipped; missing env:', missing.join(', '));
    return { statusCode: 200, body: 'skipped' };
  }

  // Template variables must be non-empty and short; WhatsApp rejects newlines and tabs in template parameters.
  const clean = (v, max = 300) => String(v || '-').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').slice(0, max) || '-';
  const params = [
    clean(d['inquiry-type'] || payload.form_name),                                   // {{1}} inquiry type
    clean([d.name, d.company].filter(Boolean).join(', ')),                             // {{2}} name, company
    clean([d.email, d.phone].filter(Boolean).join(' / ')),                             // {{3}} contact
    clean(d.message || d.interest || d.request || d.application || d.tp || '-', 500), // {{4}} details
  ];

  const url = `https://graph.facebook.com/${env.GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: env.LEAD_ALERT_TO,
    type: 'template',
    template: {
      name: env.WHATSAPP_TEMPLATE,
      language: { code: env.WHATSAPP_TEMPLATE_LANG },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
    },
  };

  // WhatsApp has no "cc": the same alert is sent to the main number and to each copy number in turn.
  const recipients = [env.LEAD_ALERT_TO, ...(env.LEAD_ALERT_CC || '').split(',')]
    .map((n) => n.replace(/[^0-9]/g, '')).filter(Boolean);
  for (const to of [...new Set(recipients)]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, to }),
      });
      if (!res.ok) console.error('WhatsApp API error for', to, res.status, await res.text());
    } catch (err) {
      console.error('WhatsApp request failed for', to, err);
    }
  }
  // Always 200: the form submission is already stored; a failed alert must not affect it.
  return { statusCode: 200, body: 'ok' };
};

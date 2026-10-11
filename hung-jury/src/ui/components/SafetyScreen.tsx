'use client';

import Link from 'next/link';

/**
 * Safety mode: flat parchment, plain text, no bobbleheads, no wobble, no judge face.
 * Message and resources are the fixed copy from the Globals tab (verify numbers before launch).
 */
export const SAFETY_MESSAGE =
  'This case has been closed. What you described sounds serious, and it is not something a mock court should decide. If you or someone else is in danger, please contact local emergency services. Support is listed below.';

export const SAFETY_RESOURCES: { category: string; resource: string }[] = [
  { category: 'Immediate danger', resource: 'Call 911' },
  { category: 'Suicide or self-harm', resource: '988 Suicide and Crisis Lifeline (call or text 988)' },
  {
    category: 'Domestic or relationship abuse',
    resource: 'National Domestic Violence Hotline, 1-800-799-7233 (text START to 88788)',
  },
  { category: 'Sexual assault', resource: 'RAINN, 1-800-656-4673' },
  { category: 'General crisis support', resource: 'Crisis Text Line (text HOME to 741741)' },
];

export function SafetyScreen() {
  return (
    <div className="lj">
      <main className="safety-screen" role="alert">
        <div className="safety-content">
          <h1>This case has been closed</h1>
          <p>{SAFETY_MESSAGE}</p>
          <h2>Support</h2>
          <table>
            <tbody>
              {SAFETY_RESOURCES.map((r) => (
                <tr key={r.category}>
                  <th scope="row">{r.category}</th>
                  <td>{r.resource}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href="/" className="b b-outline">
            Return home
          </Link>
        </div>
      </main>
    </div>
  );
}

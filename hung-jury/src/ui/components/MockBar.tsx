'use client';

import type { Role } from '@/contracts';
import type { FixtureName } from '../room/fixtures';
import type { MockControls } from '../room/useRoom';
import { LjButton } from './LjButton';

const FIXTURES: { name: FixtureName; label: string }[] = [
  { name: 'oat-milk', label: 'Oat milk (silly)' },
  { name: 'dial-040', label: 'Dial 0.4' },
  { name: 'dial-055', label: 'Dial 0.55' },
  { name: 'dial-090', label: 'Dial 0.9' },
  { name: 'safety', label: 'Safety ending' },
];

export interface MockBarProps {
  controls: MockControls;
  meRole: Role;
  setMeRole: (r: Role) => void;
  disconnected: Role | null;
  setDisconnected: (r: Role | null) => void;
}

/** Dev only: the "Preview states" panel. Play, pause, restart, jump, pick a fixture, switch who you are. */
export function MockBar({ controls, meRole, setMeRole, disconnected, setDisconnected }: MockBarProps) {
  if (!controls.enabled) return null;
  return (
    <details className="preview-states" open>
      <summary>Preview states (mock player)</summary>
      <div className="preview-controls">
        <label>
          Fixture
          <select value={controls.fixture} onChange={(e) => controls.setFixture(e.target.value as FixtureName)}>
            {FIXTURES.map((f) => (
              <option key={f.name} value={f.name}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          My role
          <select value={meRole} onChange={(e) => setMeRole(e.target.value as Role)}>
            <option value="juror">Juror</option>
            <option value="plaintiff">Plaintiff (dave)</option>
            <option value="defendant">Defendant (maya)</option>
          </select>
        </label>
        <label>
          Disconnected arguer
          <select
            value={disconnected ?? ''}
            onChange={(e) => setDisconnected((e.target.value || null) as Role | null)}
          >
            <option value="">None</option>
            <option value="plaintiff">Plaintiff</option>
            <option value="defendant">Defendant</option>
          </select>
        </label>
        <div className="preview-buttons">
          <LjButton size="sm" onClick={controls.playing ? controls.pause : controls.play}>
            {controls.playing ? 'Pause' : 'Play'}
          </LjButton>
          <LjButton size="sm" onClick={controls.restart}>
            Restart
          </LjButton>
          {(['statements', 'cross', 'verdict', 'ruling'] as const).map((t) => (
            <LjButton key={t} size="sm" onClick={() => controls.jump(t)}>
              Jump to {t === 'ruling' ? 'the ruling' : t}
            </LjButton>
          ))}
          <LjButton
            size="sm"
            variant="destructive"
            onClick={() => {
              // The safety event only exists in the safety fixture, so switch to it first.
              controls.setFixture('safety');
              setTimeout(() => controls.jump('safety'), 150);
            }}
          >
            Show safety screen
          </LjButton>
        </div>
      </div>
    </details>
  );
}

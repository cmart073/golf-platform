import React, { useEffect, useState } from 'react';
import { api } from '../../api';

// Format + scoring step. Visual chips for game selection, side-by-side
// scoring-mode cards. Hits /api/admin/formats whenever the selection
// changes so we get the canonical inferred mode + capability flag.

export default function FormatStep({ data, setData, onComplete }) {
  const [formats, setFormats] = useState([]);
  const [meta, setMeta] = useState({ inferred: 'distributed', canUseDistributed: true });

  const games = data.enabled_games;
  const hasBBB = ['bingo', 'bango', 'bongo'].every((g) => games.includes(g));

  useEffect(() => {
    api.getFormats(games).then((res) => {
      setFormats(res.formats || []);
      setMeta({
        inferred: res.inferred_scoring_mode || 'distributed',
        canUseDistributed: res.can_use_distributed !== false,
      });
      if (res.can_use_distributed === false && data.scoring_mode === 'distributed') {
        setData({ ...data, scoring_mode: 'single' });
      }
    }).catch(() => {});
  }, [games.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGame = (key) => {
    const set = new Set(games);
    const checked = key === 'bingo_bango_bongo' ? !hasBBB : !set.has(key);
    if (key === 'bingo_bango_bongo') {
      ['bingo', 'bango', 'bongo'].forEach((g) => checked ? set.add(g) : set.delete(g));
    } else {
      checked ? set.add(key) : set.delete(key);
      if (key === 'stroke_play' && checked) set.delete('match_play');
      if (key === 'match_play' && checked) set.delete('stroke_play');
    }
    setData({ ...data, enabled_games: Array.from(set) });
  };

  const visible = formats.filter((f) => !['bango', 'bongo'].includes(f.id));
  const ready = games.length > 0;
  useEffect(() => { onComplete?.(ready); }, [ready, onComplete]);

  const ICONS = {
    stroke_play: '⛳', match_play: '🥊', skins: '🏆', bingo: '🎲',
    nassau: '💰', wolf: '🐺', nine_points: '🎯', jeff_martin: '🎖️',
  };

  return (
    <section className="wiz-section">
      <header className="wiz-section-head">
        <div className="wiz-step-num">2</div>
        <h2>Formats &amp; scoring</h2>
      </header>

      <div className="wiz-format-grid">
        {visible.map((f) => {
          const isBBBProxy = f.id === 'bingo';
          const checked = isBBBProxy ? hasBBB : games.includes(f.id);
          const conflicted = f.conflicts_with.some((c) => games.includes(c));
          return (
            <button
              key={f.id}
              type="button"
              disabled={conflicted}
              className={`wiz-format-card ${checked ? 'on' : ''} ${conflicted ? 'disabled' : ''}`}
              onClick={() => toggleGame(isBBBProxy ? 'bingo_bango_bongo' : f.id)}
            >
              <div className="wiz-fmt-icon">{ICONS[f.id] || '🏌️'}</div>
              <div className="wiz-fmt-name">{isBBBProxy ? 'Bingo Bango Bongo' : f.label}</div>
              <div className="wiz-fmt-desc">{f.description}</div>
              {f.is_side_game && <div className="wiz-fmt-badge">side game</div>}
            </button>
          );
        })}
      </div>

      <div className="wiz-mode-row">
        <button
          type="button"
          className={`wiz-mode-card ${data.scoring_mode === 'single' ? 'on' : ''}`}
          onClick={() => setData({ ...data, scoring_mode: 'single' })}
        >
          <div className="wiz-mode-title">👤 Single scorer</div>
          <div className="wiz-mode-desc">One person enters every score for the group.</div>
        </button>
        <button
          type="button"
          disabled={!meta.canUseDistributed}
          className={`wiz-mode-card ${data.scoring_mode === 'distributed' ? 'on' : ''} ${!meta.canUseDistributed ? 'disabled' : ''}`}
          onClick={() => meta.canUseDistributed && setData({ ...data, scoring_mode: 'distributed' })}
        >
          <div className="wiz-mode-title">👥 Distributed</div>
          <div className="wiz-mode-desc">
            Each team enters their own scores via their own link.
            {!meta.canUseDistributed && <em> Not supported by current games.</em>}
          </div>
        </button>
      </div>
      <div className="wiz-hint">Suggested for this mix: <strong>{meta.inferred}</strong></div>
    </section>
  );
}

(() => {
  const style = document.createElement('style');
  style.textContent = `
    .history-review-summary {display:block;margin-top:11px;padding:10px 11px;border-radius:11px;color:#205b38;background:#edf8f3;font-size:11px;font-weight:800;line-height:1.45}
    .history-review-summary.pending {color:#6f5a12;background:#fff8df}
    .history-review-summary.issue {color:#8a1d24;background:#fff0f1}
    .history-review-detail {display:block;margin-top:5px;font-weight:700}
    .saved-review-overlay{position:fixed;inset:0;z-index:20000;background:#f5f5f7;overflow-y:auto;padding-bottom:calc(32px + env(safe-area-inset-bottom))}
    .saved-review-topbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;min-height:68px;padding:12px 16px;background:#fff;border-bottom:1px solid #e3e3e7}
    .saved-review-back{display:grid;place-items:center;width:42px;height:42px;border:0;border-radius:50%;background:#f0f0f2;color:#18181b;font-size:25px;cursor:pointer}
    .saved-review-main{width:min(100% - 28px,520px);margin:0 auto;padding:24px 0}
    .saved-review-card{margin-bottom:14px;padding:18px;border-radius:20px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.06)}
    .saved-review-card h2,.saved-review-card h3{margin:0 0 10px}
    .saved-review-result{padding:13px 14px;border-radius:14px;background:#edf8f3;color:#205b38;font-weight:900;line-height:1.4}
    .saved-review-result.issue{background:#fff0f1;color:#8a1d24}
    .saved-review-row{display:grid;grid-template-columns:1.25fr .8fr .8fr;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid #eee;font-size:12px}
    .saved-review-row:last-child{border-bottom:0}
    .saved-review-row strong{font-size:12px}
    .saved-review-row .ok{color:#17603d;font-weight:900}
    .saved-review-row .bad{color:#8a1d24;font-weight:900}
    .saved-review-note{margin:10px 0 0;color:#6e6e73;font-size:12px;line-height:1.45}
  `;
  document.head.appendChild(style);

  function historyVariableLabel(key) {
    const variable = PAYROLL_VARIABLES.find((item) => item.key === key);
    return variable?.label || key;
  }

  function historyQuantity(value) { return formatQuantity(Number(value || 0)); }

  function createReviewSummary(entry, reviewed, incidents) {
    const summary = document.createElement('span');
    summary.className = 'history-review-summary';
    if (!entry.timesheet || !entry.payroll) {
      summary.classList.add('pending');
      summary.textContent = 'Falta uno de los dos documentos para poder hacer la revisión.';
      return summary;
    }
    if (!reviewed) {
      summary.classList.add('pending');
      summary.textContent = 'Registro y nómina guardados. Falta analizarlos y guardar la revisión mensual.';
      return summary;
    }
    const mismatches = Object.entries(entry.review?.comparisons || {}).filter(([, item]) => item?.status === 'mismatch');
    if (!incidents) {
      summary.textContent = '✓ Revisión completada: todos los conceptos comparados coinciden.';
      return summary;
    }
    summary.classList.add('issue');
    summary.textContent = `⚠ ${incidents} incidencia${incidents === 1 ? '' : 's'} detectada${incidents === 1 ? '' : 's'}.`;
    mismatches.slice(0, 3).forEach(([key, result]) => {
      const detail = document.createElement('span');
      detail.className = 'history-review-detail';
      const difference = Math.abs(Number(result?.difference || 0));
      detail.textContent = `${historyVariableLabel(key)}: registro ${historyQuantity(result?.register)} · nómina ${historyQuantity(result?.payroll)} · diferencia ${historyQuantity(difference)}.`;
      summary.appendChild(detail);
    });
    return summary;
  }

  function showSavedReviewSummary(entry) {
    document.getElementById('saved-review-overlay')?.remove();
    const incidents = monthlyIncidentCount(entry.review);
    const comparisons = Object.entries(entry.review?.comparisons || {});
    const overlay = document.createElement('section');
    overlay.id = 'saved-review-overlay';
    overlay.className = 'saved-review-overlay';
    overlay.innerHTML = `
      <header class="saved-review-topbar">
        <button type="button" class="saved-review-back" aria-label="Volver al historial">‹</button>
        <strong>Revisión guardada</strong>
      </header>
      <main class="saved-review-main">
        <section class="saved-review-card">
          <h2>${monthNames[entry.month - 1][0].toUpperCase()}${monthNames[entry.month - 1].slice(1)} de ${entry.year}</h2>
          <div class="saved-review-result${incidents ? ' issue' : ''}">${incidents ? `⚠ ${incidents} incidencia${incidents === 1 ? '' : 's'} detectada${incidents === 1 ? '' : 's'}` : '✓ Revisión completada · Todo correcto'}</div>
          <p class="saved-review-note">Este es el resultado ya guardado de la comparación. Abrirlo no vuelve a analizar los documentos ni consume IA.</p>
        </section>
        <section class="saved-review-card">
          <h3>Comparación guardada</h3>
          <div class="saved-review-comparisons"></div>
        </section>
      </main>`;

    const list = overlay.querySelector('.saved-review-comparisons');
    if (!comparisons.length) {
      const empty = document.createElement('p');
      empty.className = 'saved-review-note';
      empty.textContent = 'La revisión está marcada como completada, pero no hay un detalle de conceptos guardado para este periodo.';
      list.appendChild(empty);
    } else {
      comparisons.forEach(([key, result]) => {
        const row = document.createElement('div');
        row.className = 'saved-review-row';
        const status = result?.status === 'mismatch' ? 'bad' : 'ok';
        const statusText = result?.status === 'mismatch' ? `Diferencia ${historyQuantity(Math.abs(Number(result?.difference || 0)))}` : 'Coincide';
        row.innerHTML = `<strong>${historyVariableLabel(key)}</strong><span>Registro<br><b>${historyQuantity(result?.register)}</b></span><span>Nómina<br><b>${historyQuantity(result?.payroll)}</b><br><em class="${status}">${statusText}</em></span>`;
        list.appendChild(row);
      });
    }

    overlay.querySelector('.saved-review-back').addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
    overlay.scrollTop = 0;
  }

  renderPrivateHistory = function renderPrivateHistoryPatched() {
    historyList.textContent = '';
    historyCount.textContent = historyEntries.length === 1 ? '1 periodo guardado' : `${historyEntries.length} periodos guardados`;
    historyLoading.hidden = true;
    historyError.hidden = true;
    historyList.hidden = historyEntries.length === 0;
    historyEmpty.hidden = historyEntries.length !== 0;

    historyEntries.forEach((entry) => {
      const complete = entry.timesheet && entry.payroll;
      const reviewed = entry.review?.status === 'complete';
      const incidents = monthlyIncidentCount(entry.review);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `history-card${complete ? ' complete' : ''}${incidents ? ' has-alert' : ''}`;
      card.setAttribute('aria-label', `Abrir ${monthNames[entry.month - 1]} de ${entry.year}`);

      const top = document.createElement('span');
      top.className = 'history-card-top';
      const title = document.createElement('strong');
      title.className = 'history-period-title';
      title.textContent = `${monthNames[entry.month - 1][0].toUpperCase()}${monthNames[entry.month - 1].slice(1)} de ${entry.year}`;
      const status = document.createElement('span');
      status.className = 'history-period-status';
      status.textContent = !complete ? '1 de 2' : (!reviewed ? 'Pendiente revisar' : (incidents ? `⚠ ${incidents} incidencia${incidents === 1 ? '' : 's'}` : '✓ Todo correcto'));
      top.appendChild(title);
      top.appendChild(status);

      const chips = document.createElement('span');
      chips.className = 'history-document-chips';
      chips.appendChild(createHistoryChip('Registro de jornada', entry.timesheet));
      chips.appendChild(createHistoryChip('Nómina', entry.payroll));
      if (complete) {
        chips.appendChild(createHistoryChip(reviewed ? (incidents ? `${incidents} incidencia${incidents === 1 ? '' : 's'}` : 'Revisión completada') : 'Pendiente de comparar', reviewed && !incidents, reviewed && Boolean(incidents)));
      }
      const summary = createReviewSummary(entry, reviewed, incidents);
      const openLabel = document.createElement('span');
      openLabel.className = 'history-open-label';
      openLabel.textContent = reviewed ? 'Ver revisión ›' : 'Abrir periodo ›';
      card.appendChild(top);
      card.appendChild(chips);
      card.appendChild(summary);
      card.appendChild(openLabel);
      card.addEventListener('click', () => reviewed ? showSavedReviewSummary(entry) : openHistoryPeriod(entry.year, entry.month));
      historyList.appendChild(card);
    });
  };

  function removePossibleFromIncidentWording() {
    document.querySelectorAll('#comparison-result-title').forEach((node) => {
      node.textContent = node.textContent.replace(/posibles?\s+/i, '');
    });
  }
  const wordingObserver = new MutationObserver(removePossibleFromIncidentWording);
  wordingObserver.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  removePossibleFromIncidentWording();
})();

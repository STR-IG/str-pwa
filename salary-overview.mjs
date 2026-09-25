const cents = value => Math.round(value * 100);
const finite = value => Number.isFinite(value);

// Each chart keeps its own coverage; company data never limits the gross chart.
export function buildEconomicDonuts(period) {
  const receipts = period.receipts || [];
  const sum = (rows, read) => rows.length ? rows.reduce((total, row) => total + cents(read(row)), 0) / 100 : null;
  const costRows = receipts.filter(row => finite(row.metrics?.gross) && finite(row.company?.socialSecurity));
  const gross = sum(costRows, row => row.metrics.gross);
  const company = sum(costRows, row => row.company.socialSecurity);
  const totalCost = costRows.length ? (cents(gross) + cents(company)) / 100 : null;
  const net = costRows.every(row => finite(row.metrics.net)) ? sum(costRows, row => row.metrics.net) : null;
  const grossRows = receipts.filter(row => finite(row.metrics?.gross));
  const totalGross = sum(grossRows, row => row.metrics.gross);
  const definitions = [
    ['Líquido/neto recibido', row => row.metrics.net, 'var(--green)'],
    ['IRPF', row => row.discounts?.irpf, 'var(--red)'],
    ['Seguridad Social del trabajador', row => row.discounts?.socialSecurity, '#e4a229'],
    ['Otros descuentos', row => row.discounts?.other, '#64748b']
  ];
  const slices = definitions.map(([label, read, color]) => {
    const available = grossRows.filter(row => finite(read(row)));
    return { label, amount: sum(available, read), available: available.length, color };
  });
  const mismatchRows = receipts.filter(row => [row.metrics?.gross, row.metrics?.net, row.metrics?.deductions].every(finite)
    && cents(row.metrics.gross) - cents(row.metrics.deductions) !== cents(row.metrics.net));
  const explained = slices.reduce((total, slice) => total + (slice.amount === null ? 0 : cents(slice.amount)), 0);
  const remainder = totalGross === null ? null : (cents(totalGross) - explained) / 100;
  const validGross = totalGross > 0 && remainder >= 0 && grossRows.every(row => {
    const amounts = definitions.map(([, read]) => read(row)).filter(finite);
    return row.metrics.gross >= 0 && amounts.every(amount => amount >= 0)
      && amounts.reduce((total, amount) => total + cents(amount), 0) <= cents(row.metrics.gross);
  });
  return {
    total: receipts.length,
    cost: { gross, company, total: totalCost, available: costRows.length,
      withCompany: receipts.filter(row => finite(row.company?.socialSecurity)).length,
      valid: totalCost > 0 && costRows.every(row => row.metrics.gross >= 0 && row.company.socialSecurity >= 0) },
    salary: { total: totalGross, available: grossRows.length, slices, remainder, valid: validGross },
    perHundred: totalCost > 0 && net !== null && net >= 0 && net <= totalCost ? net / totalCost * 100 : null,
    mismatchCount: mismatchRows.length,
    mismatch: sum(mismatchRows, row => (cents(row.metrics.gross) - cents(row.metrics.deductions) - cents(row.metrics.net)) / 100)
  };
}

export function buildEconomicValue(period) {
  const receipts = period.receipts || [];
  const comparable = receipts.filter(receipt => [
    receipt.metrics?.gross,
    receipt.metrics?.net,
    receipt.discounts?.irpf,
    receipt.discounts?.socialSecurity,
    receipt.discounts?.other,
    receipt.company?.socialSecurity
  ].every(finite));
  const sum = read => comparable.reduce((total, receipt) => total + cents(read(receipt)), 0) / 100;
  const result = { available: comparable.length, total: receipts.length, complete: comparable.length === receipts.length, slices: [] };
  if (!comparable.length) return { ...result, reason: 'No hay nóminas con todos los importes necesarios para representar este reparto con seguridad.' };

  result.gross = sum(receipt => receipt.metrics.gross);
  result.net = sum(receipt => receipt.metrics.net);
  result.irpf = sum(receipt => receipt.discounts.irpf);
  result.workerSocialSecurity = sum(receipt => receipt.discounts.socialSecurity);
  result.other = sum(receipt => receipt.discounts.other);
  result.company = sum(receipt => receipt.company.socialSecurity);
  result.publicTotal = (cents(result.irpf) + cents(result.workerSocialSecurity) + cents(result.company)) / 100;
  result.fromPayroll = (cents(result.irpf) + cents(result.workerSocialSecurity)) / 100;
  result.totalRepresented = (cents(result.gross) + cents(result.company)) / 100;
  const explained = (cents(result.net) + cents(result.publicTotal) + cents(result.other)) / 100;
  if ([result.gross, result.net, result.irpf, result.workerSocialSecurity, result.other, result.company].some(value => value < 0)
      || result.totalRepresented <= 0 || Math.abs(cents(explained) - cents(result.totalRepresented)) > 2) {
    return { ...result, reason: 'Los importes disponibles no permiten un reparto matemático fiable. Se muestran los datos, pero no se fuerza el gráfico.' };
  }
  const amounts = [result.net, result.publicTotal, ...(result.other > 0.02 ? [result.other] : [])];
  result.slices = amounts.map(amount => ({ amount, percent: amount / result.totalRepresented * 100 }));
  result.twoPart = result.other <= 0.02;
  return result;
}

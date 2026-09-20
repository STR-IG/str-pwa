const cents = value => Math.round(value * 100);
const finite = value => Number.isFinite(value);

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

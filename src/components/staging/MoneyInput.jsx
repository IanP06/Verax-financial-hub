import { useState } from 'react';
import { toNumberAR } from '../../utils/money.js';
import { formatStagingMoney, stagingMoneyWidth } from '../../utils/stagingAmounts.js';

export default function MoneyInput({ value, onChange, readOnly = false, label }) {
    const [draft, setDraft] = useState(null);
    const displayed = draft ?? formatStagingMoney(value);
    return <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        readOnly={readOnly}
        value={displayed}
        title={formatStagingMoney(value)}
        style={{ width: stagingMoneyWidth(displayed), minWidth: '14ch' }}
        className="border rounded p-1 text-right tabular-nums shrink-0 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
        onFocus={() => { if (!readOnly) setDraft(value === '' ? '' : String(toNumberAR(value)).replace('.', ',')); }}
        onChange={event => {
            const text = event.target.value;
            if (!/^[\d.,\s]*$/.test(text)) return;
            setDraft(text);
            onChange?.(text === '' ? '' : toNumberAR(text));
        }}
        onBlur={() => setDraft(null)}
    />;
}

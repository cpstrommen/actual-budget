import type { CSSProperties, ReactNode } from 'react';

import { Button } from '@actual-app/components/button';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type {
  CfmRecord,
  CfmRecordKind,
} from '@actual-app/core/types/models/cfm';

export const fieldStyle: CSSProperties = {
  color: theme.pageText,
  background: theme.tableBackground,
  border: `1px solid ${theme.tableBorder}`,
  borderRadius: 4,
  padding: '7px 9px',
  minHeight: 34,
  font: 'inherit',
  width: '100%',
};

export const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
  gap: 12,
  alignItems: 'end',
};

export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: theme.tableBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 6,
        padding: 18,
        marginBottom: 18,
      }}
    >
      <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>{title}</h2>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label
      style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13 }}
    >
      <span>{label}</span>
      {children}
      {hint && (
        <span style={{ color: theme.pageTextLight, fontSize: 12 }}>{hint}</span>
      )}
    </label>
  );
}

export function Choice({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        style={fieldStyle}
        value={value}
        onChange={event => onChange(event.target.value)}
        required={required}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Money({ amount }: { amount: number }) {
  return <span style={styles.tnum}>{integerToCurrency(amount)}</span>;
}

export function Metric({
  label,
  amount,
  text,
}: {
  label: string;
  amount?: number;
  text?: string;
}) {
  return (
    <div
      style={{
        padding: 14,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{ fontSize: 12, color: theme.pageTextLight, marginBottom: 5 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 23, fontWeight: 600 }}>
        {amount === undefined ? text : <Money amount={amount} />}
      </div>
    </div>
  );
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
      >
        <thead>
          <tr>
            {headers.map(header => (
              <th
                key={header}
                style={{
                  padding: 9,
                  textAlign: 'left',
                  borderBottom: `1px solid ${theme.tableBorder}`,
                  color: theme.pageTextLight,
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({
  children,
  right = false,
}: {
  children?: ReactNode;
  right?: boolean;
}) {
  return (
    <td
      style={{
        padding: 9,
        borderBottom: `1px solid ${theme.tableBorder}`,
        textAlign: right ? 'right' : 'left',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  );
}

export function Action({
  children,
  onPress,
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="bare" onPress={onPress} isDisabled={disabled}>
      {children}
    </Button>
  );
}

/** Convert the user's decimal amount without floating-point multiplication. */
export function parseMoney(value: string): number {
  const normalized = value.trim().replaceAll(',', '');
  if (!/^[+-]?\d+(?:\.\d{0,2})?$/.test(normalized)) {
    throw new Error('Enter a monetary amount with at most two decimal places.');
  }
  const negative = normalized.startsWith('-');
  const [whole, fraction = ''] = normalized.replace(/^[+-]/, '').split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount)) {
    throw new Error('The amount is too large.');
  }
  return negative ? -amount : amount;
}

export function moneyInput(amount: number): string {
  return `${amount < 0 ? '-' : ''}${Math.floor(Math.abs(amount) / 100)}.${String(Math.abs(amount) % 100).padStart(2, '0')}`;
}

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function newId(): string {
  return crypto.randomUUID();
}

export type SaveRecord = <T extends Record<string, unknown>>(
  kind: CfmRecordKind,
  data: T,
  id?: string,
  expectedUpdatedAt?: string,
) => Promise<boolean>;
export type DeleteRecord = (record: CfmRecord) => Promise<boolean>;

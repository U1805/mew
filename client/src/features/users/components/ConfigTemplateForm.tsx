import React from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { useI18n } from '../../../shared/i18n';

// ==========================================
// Logic / Types (Preserved)
// ==========================================

export type TemplatePrimitiveType = 'string' | 'url' | 'int' | 'float' | 'bool' | 'token';

export type TemplateDescriptor = {
  type: TemplatePrimitiveType;
  desc?: string;
  required?: boolean;
};

export type TemplateSchema = unknown;

const ALLOWED_TYPES = new Set<TemplatePrimitiveType>(['string', 'url', 'int', 'float', 'bool', 'token']);

export const isTemplateDescriptor = (v: unknown): v is TemplateDescriptor => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const t = (v as any).type;
  return typeof t === 'string' && ALLOWED_TYPES.has(t as TemplatePrimitiveType);
};

export const isTemplateSchemaLike = (schema: unknown): boolean => {
  const visit = (node: unknown): boolean => {
    if (isTemplateDescriptor(node)) return true;
    if (Array.isArray(node)) return node.length > 0 && node.every(visit);
    if (node && typeof node === 'object') {
      const entries = Object.entries(node as Record<string, unknown>);
      if (entries.length === 0) return false;
      return entries.every(([, v]) => visit(v));
    }
    return false;
  };
  return visit(schema);
};

const requiredOf = (d: TemplateDescriptor) => d.required !== false;

const isEmptyValue = (t: TemplatePrimitiveType, v: any) => {
  if (t === 'bool') return false;
  if (t === 'int' || t === 'float') return v == null || v === '' || Number.isNaN(v);
  return typeof v !== 'string' || v.trim() === '';
};

const isValidURL = (raw: string) => {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

export const buildInitialValueFromSchema = (schema: unknown): any => {
  if (isTemplateDescriptor(schema)) {
    switch (schema.type) {
      // Always initialize booleans to false (even when required=false) so toggles are stable.
      case 'bool': return false;
    }
    if (!requiredOf(schema)) return undefined;
    switch (schema.type) {
      case 'int': case 'float': return null;
      case 'url': case 'string': default: return '';
    }
  }
  if (Array.isArray(schema)) return [buildInitialValueFromSchema(schema[0])];
  if (schema && typeof schema === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      out[k] = buildInitialValueFromSchema(v);
    }
    return out;
  }
  return undefined;
};

export const hydrateValueFromSchema = (schema: unknown, raw: any): any => {
  if (isTemplateDescriptor(schema)) {
    const t = schema.type;
    // Always hydrate booleans to a concrete value for stable toggles.
    if (t === 'bool') return typeof raw === 'boolean' ? raw : false;
    if (t === 'int') return typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : (requiredOf(schema) ? null : undefined);
    if (t === 'float') return typeof raw === 'number' && Number.isFinite(raw) ? raw : (requiredOf(schema) ? null : undefined);
    if (t === 'url' || t === 'string' || t === 'token') return typeof raw === 'string' ? raw : (requiredOf(schema) ? '' : undefined);
    return raw;
  }
  if (Array.isArray(schema)) {
    const itemSchema = schema[0];
    if (Array.isArray(raw)) return raw.map((x) => hydrateValueFromSchema(itemSchema, x));
    return [buildInitialValueFromSchema(itemSchema)];
  }
  if (schema && typeof schema === 'object') {
    const out: Record<string, any> = {};
    const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      out[k] = hydrateValueFromSchema(v, (obj as any)[k]);
    }
    return out;
  }
  return raw;
};

export const validateValueAgainstSchema = (schema: unknown, value: any): string[] => {
  const errors: string[] = [];
  const visit = (node: unknown, v: any, path: string[]) => {
    if (isTemplateDescriptor(node)) {
      const p = path.join('.') || '(root)';
      const isRequired = requiredOf(node);
      if (isRequired && isEmptyValue(node.type, v)) {
        errors.push(`${p} is required`);
        return;
      }
      if (!isRequired && isEmptyValue(node.type, v)) return;
      switch (node.type) {
        case 'bool': if (typeof v !== 'boolean') errors.push(`${p} must be boolean`); return;
        case 'int': if (typeof v !== 'number' || !Number.isInteger(v)) errors.push(`${p} must be an integer`); return;
        case 'float': if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${p} must be a number`); return;
        case 'url': if (typeof v !== 'string' || !isValidURL(v)) errors.push(`${p} must be a valid http(s) URL`); return;
        case 'token':
        case 'string':
        default:
          if (typeof v !== 'string') errors.push(`${p} must be a string`);
          return;
      }
    }
    if (Array.isArray(node)) {
      if (!Array.isArray(v)) { errors.push(`${path.join('.')} must be an array`); return; }
      v.forEach((item: any, idx: number) => visit(node[0], item, [...path, String(idx + 1)]));
      return;
    }
    if (node && typeof node === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push(`${path.join('.')} must be an object`); return; }
      for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
        visit(child, (v as any)[k], [...path, k]);
      }
      return;
    }
  };
  visit(schema, value, []);
  return errors;
};

export const cleanValueForConfig = (schema: unknown, value: any): any => {
  if (isTemplateDescriptor(schema)) {
    if (!requiredOf(schema) && isEmptyValue(schema.type, value)) return undefined;
    if (schema.type === 'int' && typeof value === 'number') return Math.trunc(value);
    return value;
  }
  if (Array.isArray(schema)) {
    const itemSchema = schema[0];
    const arr = Array.isArray(value) ? value : [];
    return arr.map((x) => cleanValueForConfig(itemSchema, x));
  }
  if (schema && typeof schema === 'object') {
    const out: Record<string, any> = {};
    const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    for (const [k, child] of Object.entries(schema as Record<string, unknown>)) {
      const cleaned = cleanValueForConfig(child, (obj as any)[k]);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value;
};

// ==========================================
// UI Components (Re-styled for Discord)
// ==========================================

const DiscordToggle: React.FC<{
  checked: boolean;
  onChange: (c: boolean) => void;
}> = ({ checked, onChange }) => (
  <div 
    className={clsx(
      "w-10 h-6 rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out relative flex-shrink-0",
      checked ? "bg-[#23A559]" : "bg-[#80848E]"
    )}
    onClick={() => onChange(!checked)}
  >
    <div
      className={clsx(
        "w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out absolute top-1",
        checked ? "left-[22px]" : "left-[2px]"
      )}
    >
      {/* Discord sometimes puts a subtle icon inside, but usually blank for settings */}
    </div>
  </div>
);

const FieldLabel: React.FC<{
  label: string;
  required?: boolean;
  className?: string;
}> = ({ label, required, className }) => {
  const { t } = useI18n();
  return (
    <div className={clsx("flex items-center mb-2", className)}>
      <label className="text-xs font-bold text-[#B5BAC1] uppercase tracking-wide leading-none select-none">
        {label}
      </label>
      {required && (
        <span className="text-[#F23F42] text-sm leading-none ml-1 font-sans" title={t('config.required')}>*</span>
      )}
    </div>
  );
};

const FieldDescription: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!children) return null;
  return <p className="text-xs text-[#949BA4] mb-2 leading-tight">{children}</p>;
};

const DiscordInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    className={clsx(
      "w-full bg-[#1E1F22] text-[#DBDEE1] placeholder-[#5C5E66] rounded-[3px] py-2.5 px-3 text-sm font-medium",
      "border-none outline-none transition-all",
      // 聚焦状态
      "focus:bg-[#1E1F22] focus:ring-0",
      // --- 关键修改：隐藏数字输入框的默认 Spinner ---
      // 1. Firefox
      "[appearance:textfield]",
      // 2. Chrome, Safari, Edge, Opera
      "[&::-webkit-outer-spin-button]:appearance-none",
      "[&::-webkit-inner-spin-button]:appearance-none",
      className
    )}
    {...props}
  />
);

const PrimitiveField: React.FC<{
  name: string;
  descriptor: TemplateDescriptor;
  value: any;
  onChange: (nextValue: any) => void;
  hideLabel?: boolean;
}> = ({ name, descriptor, value, onChange, hideLabel }) => {
  const { t } = useI18n();
  const required = requiredOf(descriptor);
  const desc = (descriptor.desc || '').trim() || undefined;
  const [revealToken, setRevealToken] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);
  
  // Special handling for Boolean: Render as a "Row" with toggle
  if (descriptor.type === 'bool') {
    return (
      <div className="flex items-center justify-between py-1 group">
        <div className="flex flex-col pr-4">
          <div className="flex items-center">
            <span className="text-xs font-bold text-[#B5BAC1] uppercase tracking-wide leading-none select-none">
              {name}
            </span>
            {required && <span className="text-[#F23F42] text-sm ml-1">*</span>}
          </div>
          {desc && <span className="text-xs text-[#949BA4] mt-0.5">{desc}</span>}
        </div>
        <DiscordToggle checked={!!value} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="flex flex-col mb-4 last:mb-0">
      {!hideLabel && <FieldLabel label={name} required={required} />}
      {/* Description logic: If it's boolean, it's handled above. Else, show above input or below label */}
      <FieldDescription>{desc}</FieldDescription>
      
      <div className="relative">
        {descriptor.type === 'token' && !revealToken ? (
          <div
            className={clsx(
              "w-full bg-[#1E1F22] text-[#DBDEE1] rounded-[3px] py-2.5 px-3 text-sm font-medium select-none",
              "border-none outline-none transition-all pr-16"
            )}
            aria-label={t('config.hiddenField', { name })}
          >
            {'•'.repeat(16)}
          </div>
        ) : (
          <DiscordInput
            type={descriptor.type === 'int' || descriptor.type === 'float' ? 'number' : (descriptor.type === 'url' ? 'url' : 'text')}
            step={descriptor.type === 'float' ? 'any' : (descriptor.type === 'int' ? '1' : undefined)}
            placeholder={descriptor.type === 'url' ? t('channel.create.webUrlPlaceholder') : undefined}
            value={value === null || value === undefined ? '' : String(value)}
            className={descriptor.type === 'token' ? 'pr-16' : undefined}
            onChange={(e) => {
              const raw = e.target.value;
              if (descriptor.type === 'int' || descriptor.type === 'float') {
                if (raw.trim() === '') onChange(null);
                else {
                  const n = Number(raw);
                  onChange(Number.isNaN(n) ? null : n);
                }
              } else {
                onChange(raw);
              }
            }}
          />
        )}

        {descriptor.type === 'token' && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const s = value == null ? '' : String(value);
                  await navigator.clipboard.writeText(s);
                  setCopied(true);
                } catch {
                  // ignore
                }
              }}
              className="text-[#949BA4] hover:text-white transition-colors"
              title={copied ? t('message.copy.success') : t('invite.create.copy')}
              aria-label={copied ? t('config.tokenCopied') : t('config.copyToken')}
            >
              <Icon icon={copied ? 'mdi:check' : 'mdi:content-copy'} width="16" />
            </button>

            <button
              type="button"
              onClick={() => setRevealToken(!revealToken)}
              className="text-[#949BA4] hover:text-white transition-colors"
              title={revealToken ? t('config.hide') : t('config.show')}
              aria-label={revealToken ? t('config.hideToken') : t('config.showToken')}
            >
              <Icon icon={revealToken ? 'mdi:eye-off-outline' : 'mdi:eye-outline'} width="18" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const SchemaNodeField: React.FC<{
  schema: unknown;
  value: any;
  name?: string;
  onValueChange: (next: any) => void;
  level?: number;
}> = ({ schema, value, name, onValueChange, level = 0 }) => {
  const { t } = useI18n();
  
  // --- Primitive Case ---
  if (isTemplateDescriptor(schema)) {
    return (
        <PrimitiveField
        name={name || t('config.value')}
        descriptor={schema}
        value={value}
        onChange={onValueChange}
      />
    );
  }

  // --- Array Case ---
  if (Array.isArray(schema)) {
    const itemSchema = schema[0];
    const arr = Array.isArray(value) ? value : [];
    
    return (
      <div className="space-y-3">
        <div className="flex items-end justify-between border-b border-[#3F4147] pb-2 mb-2">
           <div className="text-xs font-bold text-[#B5BAC1] uppercase tracking-wide">
             {name ? `${name} (${t('config.list')})` : t('config.items')}
           </div>
           {/* Discord Secondary Button Style for Add */}
           <button
            type="button"
            onClick={() => onValueChange([...(arr || []), buildInitialValueFromSchema(itemSchema)])}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#4E5058] hover:bg-[#6D6F78] text-white text-xs font-medium rounded-[3px] transition-colors"
          >
            {t('config.addItem')}
          </button>
        </div>
        
        {arr.length === 0 ? (
          <div className="p-6 bg-[#2B2D31] border border-dashed border-[#4E5058] rounded-[4px] flex flex-col items-center justify-center text-center">
            <Icon icon="mdi:playlist-remove" width="24" className="text-[#949BA4] mb-2" />
            <span className="text-xs text-[#949BA4]">{t('config.listEmpty')}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {arr.map((item: any, idx: number) => (
              <div 
                key={idx} 
                className="group relative bg-[#2B2D31] rounded-[4px] p-3 border border-transparent hover:border-[#4E5058] transition-all"
              >
                <div className="flex items-center justify-between mb-3 border-b border-[#3F4147] pb-2">
                   <div className="flex items-center gap-2">
                      <span className="bg-[#1E1F22] text-[#B5BAC1] text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                        #{idx + 1}
                      </span>
                   </div>
                   <button
                    type="button"
                    onClick={() => onValueChange(arr.filter((_: any, i: number) => i !== idx))}
                    className="text-[#949BA4] hover:text-[#DA373C] transition-colors"
                    title={t('config.removeItem')}
                  >
                    <Icon icon="mdi:trash-can" width="16" />
                  </button>
                </div>
                
                <div className="pl-1">
                  <SchemaNodeField
                    schema={itemSchema}
                    value={item}
                    onValueChange={(next) => {
                      const nextArr = [...arr];
                      nextArr[idx] = next;
                      onValueChange(nextArr);
                    }}
                    level={level + 1}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Object Case ---
  if (schema && typeof schema === 'object') {
    const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const entries = Object.entries(schema as Record<string, unknown>);
    
    // If we are deep in nesting (level > 0), we add visual indentation
    const containerClass = level > 0 
      ? "pl-3 border-l-2 border-[#3F4147] ml-1 mt-1 space-y-4" 
      : "space-y-4"; // Increased vertical spacing

    return (
      <div className={containerClass}>
        {entries.map(([k, child]) => {
          
          // Case 1: Child is Primitive
          if (isTemplateDescriptor(child)) {
            return (
              <PrimitiveField
                key={k}
                name={k}
                descriptor={child}
                value={obj[k]}
                onChange={(nextValue) => onValueChange({ ...obj, [k]: nextValue })}
              />
            );
          }

          // Case 2: Child is Complex (Object/Array)
          const label = k;
          return (
            <div key={k} className="flex flex-col">
              {/* Only show header for objects if they aren't implicit arrays */}
              {!Array.isArray(child) && (
                <div className="mb-2 pb-1 border-b border-[#3F4147]/50">
                   <span className="text-xs font-bold text-[#B5BAC1] uppercase tracking-wide">
                     {label}
                   </span>
                </div>
              )}
              <SchemaNodeField
                name={Array.isArray(child) ? label : undefined}
                schema={child}
                value={obj[k]}
                onValueChange={(next) => onValueChange({ ...obj, [k]: next })}
                level={level + 1}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return null;
};

export const ConfigTemplateForm: React.FC<{
  schema: TemplateSchema;
  value: any;
  onChange: (nextValue: any) => void;
}> = ({ schema, value, onChange }) => {
  return (
    // Top-level container
    <div className="w-full animate-fade-in p-1">
      <SchemaNodeField schema={schema} value={value} onValueChange={onChange} />
    </div>
  );
};

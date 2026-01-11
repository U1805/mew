import React from 'react';
import clsx from 'clsx';

export const Switch: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={onChange}
    className={clsx(
      'w-[40px] h-[24px] rounded-full p-[2px] transition-colors duration-200 ease-in-out flex items-center relative cursor-pointer',
      disabled ? 'opacity-50 cursor-not-allowed' : '',
      checked ? 'bg-[#23A559]' : 'bg-[#80848E]'
    )}
  >
    <span
      className={clsx(
        'block w-[20px] h-[20px] bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out',
        checked ? 'translate-x-[16px]' : 'translate-x-0'
      )}
    />
  </button>
);


import { useId } from 'react';
import { Check, Monitor, Smartphone } from 'lucide-react';
import type { Appearance, NodeViewMode } from '@/utils/themeSettings';

const appearances: { value: Appearance; label: string; detail: string }[] = [
  { value: 'crystal-light', label: '晶透 · 亮色', detail: '冰蓝工作台与珠白卡片，按运营商和地址族对齐网络指标' },
  { value: 'crystal-dark', label: '晶透 · 暗色', detail: '深蓝黑工作台与石墨卡片，按运营商和地址族对齐网络指标' },
];
const layouts: { value: NodeViewMode; label: string; detail: string }[] = [
  { value: 'compact', label: '紧凑', detail: '压缩信息，快速浏览' },
  { value: 'standard', label: '标准', detail: '突出核心指标，按需展开' },
  { value: 'list', label: '列表', detail: '对齐数据，集中比较' },
];

function LayoutDrawing({ mode }: { mode: NodeViewMode }) {
  return <div aria-hidden="true" className="studio-layout-drawing" data-mode={mode}>{Array.from({ length: mode === 'list' ? 4 : 6 }, (_, index) => <div key={index}><i/><span/><span/></div>)}</div>;
}

export function AppearanceEditor({ value, onChange }: { value: Appearance; onChange: (value: Appearance) => void }) {
  const name = useId();
  return <fieldset className="studio-visual-options"><legend className="sr-only">默认外观</legend>{appearances.map(option => <label key={option.value} className="studio-visual-choice" data-selected={value === option.value}>
    <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)}/>
    <div className="studio-appearance-drawing" data-appearance={option.value} aria-hidden="true"><div className="studio-mini-sidebar"><i/><i/><i/></div><div className="studio-mini-main"><strong>BLACKWHITE</strong><div className="studio-mini-metrics"><i/><i/><i/></div><LayoutDrawing mode="standard"/></div></div>
    <span className="studio-choice-title">{option.label}{value === option.value && <Check size={16}/>}</span><span className="studio-choice-detail">{option.detail}</span>
  </label>)}</fieldset>;
}

export function DeviceLayoutEditor({ desktop, mobile, onDesktopChange, onMobileChange }: { desktop: NodeViewMode; mobile: NodeViewMode; onDesktopChange: (value: NodeViewMode) => void; onMobileChange: (value: NodeViewMode) => void }) {
  const id = useId();
  return <div className="studio-device-layouts">{([{ id: 'desktop', title: '桌面工作区', icon: Monitor, value: desktop, change: onDesktopChange }, { id: 'mobile', title: '移动工作区', icon: Smartphone, value: mobile, change: onMobileChange }] as const).map(device => <fieldset key={device.id}><legend><device.icon size={17}/>{device.title}</legend><div className="studio-visual-options">{layouts.map(option => <label key={option.value} className="studio-visual-choice" data-selected={device.value === option.value}>
    <input type="radio" name={`${id}-${device.id}`} value={option.value} checked={device.value === option.value} onChange={() => device.change(option.value)}/><LayoutDrawing mode={option.value}/><span className="studio-choice-title">{option.label}{device.value === option.value && <Check size={15}/>}</span><span className="studio-choice-detail">{option.detail}</span>
  </label>)}</div></fieldset>)}</div>;
}

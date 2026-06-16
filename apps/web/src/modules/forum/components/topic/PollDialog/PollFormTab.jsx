'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 20;

const DURATION_PRESETS = [
  { label: '永久', value: '' },
  { label: '1 天', value: '1' },
  { label: '3 天', value: '3' },
  { label: '7 天', value: '7' },
  { label: '30 天', value: '30' },
];

/**
 * @param {object} props
 * @param {object|null} props.editingDraft - null = 新建；否则预填编辑
 * @param {(pollId:number, wasEditing:boolean)=>void} props.onSubmitted
 * @param {()=>void} props.onCancelEdit
 */
export default function PollFormTab({ editingDraft, onSubmitted, onCancelEdit }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [selectionType, setSelectionType] = useState('single');
  const [maxChoices, setMaxChoices] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [durationDays, setDurationDays] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEditing = editingDraft != null;

  useEffect(() => {
    if (editingDraft) {
      setQuestion(editingDraft.question || '');
      setOptions(
        Array.isArray(editingDraft.options) && editingDraft.options.length >= MIN_OPTIONS
          ? editingDraft.options.map((o) => (typeof o === 'string' ? o : o.text))
          : ['', '']
      );
      setSelectionType(editingDraft.selectionType || 'single');
      setMaxChoices(editingDraft.maxChoices != null ? String(editingDraft.maxChoices) : '');
      setIsAnonymous(!!editingDraft.isAnonymous);
      setDurationDays('');
    } else {
      setQuestion('');
      setOptions(['', '']);
      setSelectionType('single');
      setMaxChoices('');
      setIsAnonymous(true);
      setDurationDays('');
    }
  }, [editingDraft]);

  const updateOption = (idx, value) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (idx) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);

    if (!trimmedQuestion) {
      toast.error('请填写投票问题');
      return;
    }
    if (trimmedOptions.length < MIN_OPTIONS) {
      toast.error(`至少填写 ${MIN_OPTIONS} 个有效选项`);
      return;
    }
    if (trimmedOptions.length > MAX_OPTIONS) {
      toast.error(`最多 ${MAX_OPTIONS} 个选项`);
      return;
    }

    let parsedMaxChoices = null;
    if (selectionType === 'multiple') {
      if (maxChoices !== '') {
        const n = Number(maxChoices);
        if (!Number.isInteger(n) || n < 1 || n > trimmedOptions.length) {
          toast.error('最多可选项数必须在 1 与选项数之间');
          return;
        }
        parsedMaxChoices = n;
      }
    }

    let closedAt;
    if (durationDays === '') {
      closedAt = isEditing ? (editingDraft.closedAt ?? null) : null;
    } else {
      const days = Number(durationDays);
      closedAt = days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : null;
    }

    const body = {
      question: trimmedQuestion,
      options: trimmedOptions,
      selectionType,
      maxChoices: parsedMaxChoices,
      isAnonymous,
      closedAt,
    };

    setSubmitting(true);
    try {
      const url = isEditing ? `/api/polls/${editingDraft.id}` : '/api/polls';
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || (isEditing ? '保存失败' : '创建投票失败'));
        return;
      }
      if (isEditing) {
        toast.success('草稿已保存');
      }
      onSubmitted?.(isEditing ? editingDraft.id : data.id, isEditing);
    } catch (err) {
      toast.error('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="poll-question">问题</Label>
        <Input
          id="poll-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="想问大家什么？"
          maxLength={500}
        />
      </div>

      <div className="space-y-2">
        <Label>选项（{options.length}/{MAX_OPTIONS}）</Label>
        <div className="space-y-2">
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={opt}
                onChange={(e) => updateOption(idx, e.target.value)}
                placeholder={`选项 ${idx + 1}`}
                maxLength={500}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeOption(idx)}
                disabled={options.length <= MIN_OPTIONS}
                title="删除该选项"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addOption}
          disabled={options.length >= MAX_OPTIONS}
        >
          <Plus className="h-4 w-4" /> 添加选项
        </Button>
      </div>

      <div className="space-y-2">
        <Label>类型</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="poll-selection-type"
              value="single"
              checked={selectionType === 'single'}
              onChange={() => setSelectionType('single')}
              className="h-4 w-4"
            />
            <span>单选</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="poll-selection-type"
              value="multiple"
              checked={selectionType === 'multiple'}
              onChange={() => setSelectionType('multiple')}
              className="h-4 w-4"
            />
            <span>多选</span>
          </label>
        </div>
      </div>

      {selectionType === 'multiple' && (
        <div className="space-y-2">
          <Label htmlFor="poll-max-choices">最多可选（留空 = 不限）</Label>
          <Input
            id="poll-max-choices"
            type="number"
            min={1}
            max={options.length}
            value={maxChoices}
            onChange={(e) => setMaxChoices(e.target.value)}
            placeholder={`1-${options.length}`}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="poll-duration">
          截止时间{isEditing && '（留空 = 不变更）'}
        </Label>
        <select
          id="poll-duration"
          value={durationDays}
          onChange={(e) => setDurationDays(e.target.value)}
          className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
        >
          {DURATION_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="poll-anonymous"
          checked={isAnonymous}
          onCheckedChange={(v) => setIsAnonymous(v === true)}
        />
        <Label htmlFor="poll-anonymous" className="cursor-pointer">
          匿名投票（不显示投票者名单）
        </Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {isEditing && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancelEdit}
            disabled={submitting}
          >
            取消编辑
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEditing ? '保存修改' : '创建投票'}
        </Button>
      </div>
    </form>
  );
}

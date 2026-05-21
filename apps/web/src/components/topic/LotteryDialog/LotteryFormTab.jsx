'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

const DURATION_PRESETS = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '1 天', hours: 24 },
  { label: '3 天', hours: 24 * 3 },
  { label: '7 天', hours: 24 * 7 },
  { label: '30 天', hours: 24 * 30 },
];

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * @param {object} props
 * @param {object|null} props.editingDraft
 * @param {(lotteryId:number, wasEditing:boolean)=>void} props.onSubmitted
 * @param {()=>void} props.onCancelEdit
 */
export default function LotteryFormTab({ editingDraft, onSubmitted, onCancelEdit }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [winnersCount, setWinnersCount] = useState('1');
  const [pointsPerWinner, setPointsPerWinner] = useState('0');
  const [prizeDescription, setPrizeDescription] = useState('');
  const [minAccountDays, setMinAccountDays] = useState('0');
  const [requireReply, setRequireReply] = useState(false);
  const [drawAt, setDrawAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState(null);

  const isEditing = editingDraft != null;

  useEffect(() => {
    if (editingDraft) {
      setTitle(editingDraft.title || '');
      setDescription(editingDraft.description || '');
      setWinnersCount(String(editingDraft.winnersCount ?? 1));
      setPointsPerWinner(String(editingDraft.pointsPerWinner ?? 0));
      setPrizeDescription(editingDraft.prizeDescription || '');
      setMinAccountDays(String(editingDraft.minAccountDays ?? 0));
      setRequireReply(!!editingDraft.requireReply);
      setDrawAt(toDatetimeLocalValue(editingDraft.drawAt));
    } else {
      setTitle('');
      setDescription('');
      setWinnersCount('1');
      setPointsPerWinner('0');
      setPrizeDescription('');
      setMinAccountDays('0');
      setRequireReply(false);
      setDrawAt('');
    }
  }, [editingDraft]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ledger/balance')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setBalance(Number(d.balance) || 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const winners = Number.parseInt(winnersCount, 10);
  const points = Number.parseInt(pointsPerWinner, 10);
  const totalFreeze = Number.isFinite(winners) && Number.isFinite(points)
    ? Math.max(0, winners) * Math.max(0, points)
    : 0;

  const oldFrozen = editingDraft?.frozenPoints ?? 0;
  const delta = totalFreeze - oldFrozen;
  const insufficient = balance != null && delta > 0 && delta > balance;

  const setPresetDrawAt = (hours) => {
    const target = new Date(Date.now() + hours * 60 * 60 * 1000);
    setDrawAt(toDatetimeLocalValue(target.toISOString()));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('请填写标题');
      return;
    }
    if (!Number.isInteger(winners) || winners < 1 || winners > 1000) {
      toast.error('名额必须在 1-1000 之间');
      return;
    }
    if (!Number.isInteger(points) || points < 0) {
      toast.error('每人积分必须是非负整数');
      return;
    }
    if (!drawAt) {
      toast.error('请选择截止时间');
      return;
    }
    const drawDate = new Date(drawAt);
    if (Number.isNaN(drawDate.getTime()) || drawDate.getTime() <= Date.now()) {
      toast.error('截止时间必须晚于当前时间');
      return;
    }
    if (insufficient) {
      toast.error('积分余额不足');
      return;
    }

    const body = {
      title: trimmedTitle,
      description: description.trim() || null,
      winnersCount: winners,
      pointsPerWinner: points,
      prizeDescription: prizeDescription.trim() || null,
      minAccountDays: Number.parseInt(minAccountDays, 10) || 0,
      requireReply,
      drawAt: drawDate.toISOString(),
    };

    setSubmitting(true);
    try {
      const url = isEditing ? `/api/lotteries/${editingDraft.id}` : '/api/lotteries';
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || (isEditing ? '保存失败' : '创建抽奖失败'));
        return;
      }
      if (isEditing) toast.success('草稿已保存');
      onSubmitted?.(isEditing ? editingDraft.id : data.id, isEditing);
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      {/* 余额 / 冻结提示 */}
      <div className={`text-xs px-3 py-2 rounded-md border ${insufficient ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-border bg-muted/40 text-muted-foreground'}`}>
        将冻结 <span className="font-medium text-foreground">{winners || 0} × {points || 0} = {totalFreeze}</span> 积分
        {isEditing && oldFrozen > 0 && (
          <>（已冻结 {oldFrozen}，{delta >= 0 ? `追加 ${delta}` : `退回 ${-delta}`}）</>
        )}
        {balance != null && (
          <>　当前余额：<span className="font-medium text-foreground">{balance}</span></>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="lot-title">标题</Label>
        <Input
          id="lot-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：晒图抽 Q 群独家邀请码"
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="lot-desc">活动说明（可选）</Label>
        <Textarea
          id="lot-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="补充说明、规则解释等"
          maxLength={2000}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="lot-winners">中奖名额</Label>
          <Input
            id="lot-winners"
            type="number"
            min={1}
            max={1000}
            value={winnersCount}
            onChange={(e) => setWinnersCount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lot-points">每人积分</Label>
          <Input
            id="lot-points"
            type="number"
            min={0}
            value={pointsPerWinner}
            onChange={(e) => setPointsPerWinner(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lot-prize">奖品描述（仅中奖者可见，可选）</Label>
        <Textarea
          id="lot-prize"
          value={prizeDescription}
          onChange={(e) => setPrizeDescription(e.target.value)}
          placeholder="例：QQ 群号 1234567、兑换码 ABCD-EFGH"
          maxLength={1000}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>截止时间</Label>
        <div className="flex flex-wrap gap-1">
          {DURATION_PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPresetDrawAt(p.hours)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Input
          type="datetime-local"
          value={drawAt}
          onChange={(e) => setDrawAt(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="lot-account-days">账号天数门槛</Label>
          <Input
            id="lot-account-days"
            type="number"
            min={0}
            value={minAccountDays}
            onChange={(e) => setMinAccountDays(e.target.value)}
            placeholder="0 = 不限"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer h-9">
            <Checkbox
              id="lot-require-reply"
              checked={requireReply}
              onCheckedChange={(v) => setRequireReply(v === true)}
            />
            <span className="text-sm">需先回复话题</span>
          </label>
        </div>
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
        <Button type="submit" disabled={submitting || insufficient}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEditing ? '保存修改' : '创建抽奖'}
        </Button>
      </div>
    </form>
  );
}

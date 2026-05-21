'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, BarChart3, Lock, CheckCircle2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

function VotersDialog({ pollId, optionId, optionText, open, onOpenChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/polls/${pollId}/voters?optionId=${optionId}&limit=100`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || '加载失败');
        }
        return res.json();
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pollId, optionId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>投票者：{optionText}</DialogTitle>
        </DialogHeader>
        {loading && <div className="py-4 text-sm text-muted-foreground">加载中…</div>}
        {error && <div className="py-4 text-sm text-destructive">{error}</div>}
        {data && (
          <div className="max-h-80 overflow-y-auto space-y-1">
            {data.voters.length === 0 && (
              <div className="py-4 text-sm text-muted-foreground text-center">暂无投票者</div>
            )}
            {data.voters.map((v) => (
              <div key={v.userId} className="flex items-center gap-2 py-1 text-sm">
                <span className="font-medium">{v.name || v.username}</span>
                <span className="text-xs text-muted-foreground">@{v.username}</span>
              </div>
            ))}
            {data.total > data.voters.length && (
              <div className="pt-2 text-xs text-muted-foreground text-center">
                共 {data.total} 人，仅显示前 {data.voters.length} 名
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PollWidget({ pollId }) {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const [poll, setPoll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [votersDialog, setVotersDialog] = useState(null); // { optionId, optionText } | null

  const loadPoll = () => {
    if (!pollId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    fetch(`/api/polls/${pollId}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || '加载失败');
        }
        return res.json();
      })
      .then((d) => {
        if (d) setPoll(d);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId]);

  const hasVoted = (poll?.myVotedOptionIds?.length ?? 0) > 0;
  const isClosed = !!poll?.isClosed;
  const showResults = hasVoted || isClosed;

  const maxVotes = useMemo(() => {
    if (!poll) return 0;
    return Math.max(1, ...poll.options.map((o) => o.voteCount));
  }, [poll]);

  if (loading) {
    return (
      <div className="not-prose my-5 relative rounded-2xl px-5 py-5 bg-linear-to-br from-sky-400/10 via-sky-400/3 to-transparent animate-pulse">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-full bg-sky-400/15"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-3 bg-muted rounded w-1/3"></div>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <div className="h-10 bg-muted rounded-lg"></div>
          <div className="h-10 bg-muted rounded-lg"></div>
          <div className="h-10 bg-muted rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="not-prose my-5 px-4 py-3 rounded-2xl bg-muted/40 text-muted-foreground text-sm flex items-center gap-2">
        <BarChart3 className="h-4 w-4" />
        该投票已被删除
      </div>
    );
  }

  if (error) {
    return (
      <div className="not-prose my-5 px-4 py-3 rounded-2xl bg-destructive/5 text-destructive text-sm">
        投票加载失败：{error}
      </div>
    );
  }

  if (!poll) return null;

  const toggleOption = (optionId) => {
    if (poll.selectionType === 'single') {
      setSelectedIds([optionId]);
      return;
    }
    setSelectedIds((prev) => {
      if (prev.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      }
      if (poll.maxChoices && prev.length >= poll.maxChoices) {
        toast.error(`最多可选 ${poll.maxChoices} 项`);
        return prev;
      }
      return [...prev, optionId];
    });
  };

  const submit = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || '投票失败');
        return;
      }
      loadPoll();
      setSelectedIds([]);
      toast.success('投票成功');
    } catch (err) {
      toast.error('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="not-prose my-5 relative rounded-2xl px-5 py-5 bg-linear-to-br from-sky-400/10 via-sky-400/5 to-sky-400/10">
      {/* 头部：徽章 + 标题 + 状态 */}
      <div className="flex items-center gap-3">
        <div className="shrink-0 h-11 w-11 rounded-full bg-sky-400/15 flex items-center justify-center ring-1 ring-sky-400/20">
          <BarChart3 className="h-5 w-5 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-foreground leading-tight truncate">
            {poll.question}
          </h3>
          <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
            {poll.isAnonymous && (
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> 匿名
              </span>
            )}
            {isClosed && (
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> 已结束
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 分隔渐变线 */}
      <div className="h-px my-4 bg-linear-to-r from-sky-400/30 via-sky-400/10 to-transparent" />

      {/* 选项区 */}
      <div className="space-y-2 mb-3">
        {poll.options.map((opt, index) => {
          const myVoted = poll.myVotedOptionIds?.includes(opt.id);
          const checked = selectedIds.includes(opt.id);
          const percent = poll.totalVoters > 0
            ? Math.round((opt.voteCount / Math.max(poll.totalVoters, 1)) * 100)
            : 0;
          const barWidth = maxVotes > 0 ? Math.round((opt.voteCount / maxVotes) * 100) : 0;
          // 选项色：cycle --chart-1..5；选项条用 element opacity（避免 color-mix）
          const chartColor = `var(--chart-${(index % 5) + 1})`;

          if (showResults) {
            return (
              <div key={opt.id} className="relative rounded-lg p-3 overflow-hidden bg-muted/30">
                <div
                  className="absolute inset-y-0 left-0 transition-all opacity-20"
                  style={{ width: `${barWidth}%`, backgroundColor: chartColor }}
                />
                <div className="relative flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: chartColor }}
                    />
                    {myVoted && <CheckCircle2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
                    <span className={myVoted ? 'font-medium' : ''}>{opt.text}</span>
                  </span>
                  <span className="flex items-center gap-3 text-muted-foreground tabular-nums">
                    <span>{opt.voteCount} 票 · {percent}%</span>
                    {!poll.isAnonymous && opt.voteCount > 0 && (
                      <button
                        type="button"
                        className="relative z-10 text-xs underline-offset-2 hover:underline hover:text-foreground"
                        onClick={() => setVotersDialog({ optionId: opt.id, optionText: opt.text })}
                      >
                        查看 {opt.voteCount} 人
                      </button>
                    )}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <label
              key={opt.id}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                checked
                  ? 'bg-sky-400/10 ring-1 ring-sky-400/30'
                  : 'bg-muted/30 hover:bg-muted/60'
              } ${!isLoggedIn ? 'cursor-not-allowed opacity-70' : ''}`}
            >
              <input
                type={poll.selectionType === 'single' ? 'radio' : 'checkbox'}
                name={`poll-${poll.id}`}
                disabled={!isLoggedIn || submitting}
                checked={checked}
                onChange={() => toggleOption(opt.id)}
                className="h-4 w-4"
              />
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: chartColor }}
              />
              <span className="flex-1">{opt.text}</span>
            </label>
          );
        })}
      </div>

      {/* 提交按钮 / 提示 */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Users className="h-3 w-3" />
          {poll.totalVoters} 人已投票
        </div>
        {!showResults && (
          <Button
            type="button"
            size="sm"
            disabled={!isLoggedIn || selectedIds.length === 0 || submitting}
            onClick={submit}
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            {isLoggedIn ? "提交" : "登录后投票"}
          </Button>
        )}
      </div>

      {votersDialog && (
        <VotersDialog
          pollId={pollId}
          optionId={votersDialog.optionId}
          optionText={votersDialog.optionText}
          open={!!votersDialog}
          onOpenChange={(v) => !v && setVotersDialog(null)}
        />
      )}
    </div>
  );
}

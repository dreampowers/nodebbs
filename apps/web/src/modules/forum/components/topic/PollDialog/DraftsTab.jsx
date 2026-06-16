'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Pencil, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const LIMIT = 20;

function formatTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return '今天';
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))} 周前`;
  return `${Math.floor(diff / (30 * day))} 月前`;
}

/**
 * @param {object} props
 * @param {number} props.refreshKey - 父组件递增以触发刷新
 * @param {(pollId:number)=>void} props.onInsert
 * @param {(draft:object)=>void} props.onEdit
 */
export default function DraftsTab({ refreshKey, onInsert, onEdit }) {
  const [drafts, setDrafts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyEdit, setBusyEdit] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/polls/drafts?page=${page}&limit=${LIMIT}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || '加载草稿失败');
        }
        return res.json();
      })
      .then((d) => {
        if (cancelled) return;
        setDrafts(d.drafts ?? []);
        setTotal(d.total ?? 0);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, refreshKey]);

  const handleEditClick = async (draft) => {
    setBusyEdit(draft.id);
    try {
      const res = await fetch(`/api/polls/${draft.id}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || '加载草稿失败');
        return;
      }
      onEdit?.({
        id: data.id,
        question: data.question,
        options: data.options.map((o) => o.text),
        selectionType: data.selectionType,
        maxChoices: data.maxChoices,
        isAnonymous: data.isAnonymous,
        closedAt: data.closedAt,
      });
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setBusyEdit(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/polls/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || '删除失败');
        return;
      }
      toast.success('草稿已删除');
      setDeleteTarget(null);
      // 触发自身刷新：通过 setPage(1) 或刷新机制
      // 简单做法：重新发请求 — 但本组件依赖 refreshKey；这里直接更新本地列表更省事
      setDrafts((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      toast.error('网络错误，请重试');
    }
  };

  if (loading && drafts.length === 0) {
    return <div className="py-8 text-sm text-muted-foreground text-center">加载中…</div>;
  }
  if (error) {
    return <div className="py-8 text-sm text-destructive text-center">{error}</div>;
  }
  if (drafts.length === 0) {
    return (
      <div className="py-8 text-sm text-muted-foreground text-center">
        还没有草稿。去『新建』Tab 创建第一个吧。
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="pt-4 space-y-2">
      {drafts.map((d) => (
        <div key={d.id} className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <BarChart3 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {d.question.length > 60 ? d.question.slice(0, 60) + '…' : d.question}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {d.selectionType === 'single' ? '单选' : '多选'}
                {' · '}
                {d.isAnonymous ? '匿名' : '实名'}
                {' · '}
                {d.optionsCount} 选项
                {' · '}
                {formatTimeAgo(d.createdAt)}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => onInsert?.(d.id)}>
              <ArrowRight className="h-3 w-3" /> 插入
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleEditClick(d)}
              disabled={busyEdit === d.id}
            >
              {busyEdit === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
              编辑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget({ id: d.id, question: d.question })}
            >
              <Trash2 className="h-3 w-3" /> 删除
            </Button>
          </div>
        </div>
      ))}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <span>共 {total} 条 · 第 {page} / {totalPages} 页</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              下一页
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除草稿</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除草稿"{deleteTarget?.question?.slice(0, 40)}…"？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

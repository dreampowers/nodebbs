'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PollDialog from '@/modules/forum/components/topic/PollDialog';
import { usePermission } from '@/hooks/usePermission';

export function PollTool({ editor, disabled, config }) {
  const { hasPermission } = usePermission();
  const [open, setOpen] = useState(false);

  // 无创建投票权限时不显示按钮
  if (!hasPermission('topic.poll.create')) {
    return null;
  }

  const handleCreated = (pollId) => {
    editor.insertBlock(`::poll{id="${pollId}"}\n`);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="插入投票"
      >
        <BarChart3 className="h-4 w-4" />
      </Button>
      <PollDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={handleCreated}
        topicId={config?.topicId}
      />
    </>
  );
}

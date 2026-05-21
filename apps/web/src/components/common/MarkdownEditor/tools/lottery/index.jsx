'use client';

import { useState } from 'react';
import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LotteryDialog from '@/components/topic/LotteryDialog';
import { usePermission } from '@/hooks/usePermission';

export function LotteryTool({ editor, disabled, config }) {
  const { hasPermission } = usePermission();
  const [open, setOpen] = useState(false);

  if (!hasPermission('topic.lottery.create')) {
    return null;
  }

  const handleCreated = (lotteryId) => {
    editor.insertBlock(`::lottery{id="${lotteryId}"}\n`);
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
        title="插入抽奖"
      >
        <Gift className="h-4 w-4" />
      </Button>
      <LotteryDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={handleCreated}
        topicId={config?.topicId}
      />
    </>
  );
}

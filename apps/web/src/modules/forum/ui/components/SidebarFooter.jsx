'use client';

import Link from '@/components/common/Link';
import { useSettings } from '@/contexts/SettingsContext';
import { Github } from 'lucide-react';

/**
 * 右侧栏底部页脚信息
 * 客户端组件，使用 useSettings 获取站点配置
 */
export default function SidebarFooter({ version }) {
  const { settings } = useSettings();
  const currentYear = new Date().getFullYear();

  const defaultLinks = [
    { label: 'API 文档', href: '/reference' },
    { label: '关于', href: '/about' },
  ];

  return (
    <div className='text-xs text-muted-foreground/70 px-1 mt-2 space-y-2.5'>
      {/* 版权信息 */}
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        <span>© {currentYear} {settings?.site_name?.value || 'NodeBBS'}</span>
        {settings?.site_footer_html?.value ? (
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 [&_a]:hover:text-foreground [&_a]:transition-colors"
            dangerouslySetInnerHTML={{ __html: settings.site_footer_html.value }}
          />
        ) : (
          <>
            {defaultLinks.map((link) => (
              <span key={link.href} className="flex items-center gap-2">
                <span>·</span>
                <Link
                  href={link.href}
                  className="hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              </span>
            ))}
          </>
        )}
      </div>

      {/* NodeBBS 标识 */}
      <div>
        <a
          href="https://github.com/aiprojecthub/nodebbs"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          <Github className='w-3.5 h-3.5' />
          Built with NodeBBS {version && `v${version}`}
        </a>
      </div>
    </div>
  );
}

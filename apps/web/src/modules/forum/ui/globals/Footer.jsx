'use client';

import Link from '@/components/common/Link';
import { useSettings } from '@/contexts/SettingsContext';
import { Github } from 'lucide-react';

/**
 * 全局页脚（由 AppLayout 渲染，全站及移动端可见）。
 * 内容：版权 + 链接（可由 settings.site_footer_html 覆盖默认链接）+ NodeBBS 标识/版本。
 *
 * 取代原先仅在右侧栏底部（lg + 列表页）显示的 SidebarFooter，
 * 使页脚信息在所有页面与移动端一致可见。版本号由 AppLayout 经 apiInfo 透传。
 */
export default function Footer({ version }) {
  const { settings } = useSettings();
  const currentYear = new Date().getFullYear();

  const defaultLinks = [
    { label: 'API 文档', href: '/reference' },
    { label: '关于', href: '/about' },
  ];

  return (
    <footer className='border-t border-border/60 mt-8'>
      <div className='container mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/70'>
        {/* 版权 + 链接 */}
        <div className='flex flex-wrap items-center justify-center gap-x-2 gap-y-1'>
          <span>© {currentYear} {settings?.site_name?.value || 'NodeBBS'}</span>
          {settings?.site_footer_html?.value ? (
            <div
              className='flex flex-wrap items-center gap-x-2 gap-y-1 [&_a]:hover:text-foreground [&_a]:transition-colors'
              dangerouslySetInnerHTML={{ __html: settings.site_footer_html.value }}
            />
          ) : (
            defaultLinks.map((link) => (
              <span key={link.href} className='flex items-center gap-2'>
                <span>·</span>
                <Link href={link.href} className='hover:text-foreground transition-colors'>
                  {link.label}
                </Link>
              </span>
            ))
          )}
        </div>

        {/* NodeBBS 标识 */}
        <a
          href='https://github.com/aiprojecthub/nodebbs'
          target='_blank'
          rel='noopener noreferrer'
          className='hover:text-foreground transition-colors inline-flex items-center gap-1 shrink-0'
        >
          <Github className='w-3.5 h-3.5' />
          Built with NodeBBS {version && `v${version}`}
        </a>
      </div>
    </footer>
  );
}

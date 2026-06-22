'use client';

import { useState } from 'react';
import Link from '@/components/common/Link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/user/UserAvatar';
import {
  Search,
  Plus,
  Settings,
  Menu,
  X,
  MessageSquare,
  LogOut,
  User,
  Mail,
  Shield,
  Wallet,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { NotificationPopover } from '@/components/common/Notification';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useLedger } from '@/extensions/ledger/contexts/LedgerContext';
import { usePermission } from '@/hooks/usePermission';
import { Loading } from '@/components/common/Loading';
import { Input } from '@/components/ui/input';

/**
 * 模板自定义顶部导航
 * 设计参考 Community：
 * - 左侧品牌名
 * - 中间搜索框
 * - 右侧通知、用户头像、发布按钮
 * - 底部装饰色条
 */
export default function Header() {
  const router = useRouter();
  const { user, isAuthenticated, loading, logout, openLoginDialog } = useAuth();
  const { settings } = useSettings();
  const { isWalletEnabled } = useLedger();
  const { hasDashboardAccess } = usePermission();
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?s=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <header className='sticky top-0 z-50'>
      {/* 主导航栏 */}
      <div className='bg-card border-b border-border'>
        <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between h-16 gap-4'>
            {/* 左侧：品牌 + 搜索框 */}
            <div className='flex items-center gap-4 min-w-0'>
              <Link href='/' className='flex items-center gap-2.5 shrink-0 group'>
                <img
                  src={settings?.site_logo?.value || '/logo.svg'}
                  alt='logo'
                  className='h-8 w-auto max-w-32 transition-transform group-hover:scale-105'
                />
                {(settings?.show_logo_text?.value !== false) && (
                  <span className='text-2xl font-bold text-foreground tracking-tight hidden sm:inline'>
                    {settings?.site_name?.value || 'NodeBBS'}
                  </span>
                )}
              </Link>
            </div>

            {/* 右侧：操作区 */}
            <div className='flex items-center gap-1.5 sm:gap-2 shrink-0'>

              {/* 搜索框（桌面端） — 紧跟品牌名 */}
              <div className='hidden md:block w-64 lg:w-80 shrink-0'>
                <form onSubmit={handleSearch} className='relative'>
                  <Search className='absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none' />
                  <Input
                    type='text'
                    placeholder='搜索...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className='w-full h-9 pl-10'
                  />
                </form>
              </div>

              {loading ? (
                <Loading size='sm' />
              ) : (
                <>
                  {/* 主题切换 */}
                  <ThemeSwitcher />

                  {/* 通知按钮 */}
                  {isAuthenticated && <NotificationPopover />}

                  {isAuthenticated ? (
                    <>
                      {/* 用户头像下拉菜单 */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className='flex items-center gap-2 rounded-full px-1 py-1 hover:bg-muted/50 transition-colors cursor-pointer'>
                            <UserAvatar
                              url={user?.avatar}
                              name={user?.name || user?.username}
                              size='xs'
                              frameMetadata={user?.avatarFrame?.itemMetadata}
                            />
                            <span className='text-sm font-medium text-foreground hidden sm:inline max-w-24 truncate'>
                              {user?.name || user?.username}
                            </span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end' className='w-56'>
                          <DropdownMenuLabel className='pb-2'>
                            <div className='flex items-center gap-2'>
                              <UserAvatar
                                url={user?.avatar}
                                name={user?.name || user?.username}
                                size='sm'
                                frameMetadata={user?.avatarFrame?.itemMetadata}
                              />
                              <div className='flex flex-col'>
                                <span className='font-medium'>
                                  {user?.name || user?.username}
                                </span>
                                <span className='text-sm text-muted-foreground font-normal'>
                                  @{user?.username}
                                </span>
                              </div>
                            </div>
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />

                          <DropdownMenuItem asChild>
                            <Link href={`/users/${user?.username}`} className='cursor-pointer'>
                              <User className='h-4 w-4' />
                              个人主页
                            </Link>
                          </DropdownMenuItem>

                          <DropdownMenuItem asChild>
                            <Link href='/profile/topics' className='cursor-pointer'>
                              <MessageSquare className='h-4 w-4' />
                              我的话题
                            </Link>
                          </DropdownMenuItem>

                          <DropdownMenuItem asChild>
                            <Link href='/profile/messages' className='cursor-pointer'>
                              <Mail className='h-4 w-4' />
                              站内信
                            </Link>
                          </DropdownMenuItem>

                          {isWalletEnabled && (
                            <DropdownMenuItem asChild>
                              <Link href='/profile/wallet' className='cursor-pointer'>
                                <Wallet className='h-4 w-4' />
                                我的钱包
                              </Link>
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem asChild>
                            <Link href='/profile/settings' className='cursor-pointer'>
                              <Settings className='h-4 w-4' />
                              个人设置
                            </Link>
                          </DropdownMenuItem>

                          {hasDashboardAccess() && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href='/dashboard' className='cursor-pointer text-primary'>
                                  <Shield className='h-4 w-4' />
                                  管理后台
                                </Link>
                              </DropdownMenuItem>
                            </>
                          )}

                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={handleLogout}
                            className='cursor-pointer text-red-600 dark:text-red-500'
                          >
                            <LogOut className='h-4 w-4' />
                            退出登录
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* 发布按钮 — 风格 "New" 按钮 */}
                      <Link href='/create'>
                        <Button
                          size='sm'
                          className='h-8 px-4 rounded-md text-sm font-semibold shadow-sm'
                        >
                          发布话题
                          <Plus className='h-3.5 w-3.5' />
                        </Button>
                      </Link>
                    </>
                  ) : (
                    /* 未登录：登录按钮 */
                    <Button
                      size='sm'
                      onClick={openLoginDialog}
                      className='h-8 px-4 rounded-md text-sm font-semibold shadow-sm'
                    >
                      <User className='h-3.5 w-3.5' />
                      登录
                    </Button>
                  )}
                </>
              )}

              {/* 移动端菜单按钮 */}
              <Popover open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='md:hidden hover:bg-muted/50 h-8 w-8'
                  >
                    {isMobileMenuOpen ? <X className='h-4 w-4' /> : <Menu className='h-4 w-4' />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align='end'
                  sideOffset={0}
                  className='w-screen mt-px rounded-none shadow-none border-x-0 border-b md:hidden p-0'
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  {/* 移动端搜索 */}
                  <div className='p-4'>
                    <form onSubmit={handleSearch} className='relative'>
                      <Search className='absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none' />
                      <Input
                        type='text'
                        placeholder='搜索...'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className='w-full h-9 pl-10'
                      />
                    </form>
                  </div>

                  {/* 移动端导航链接 */}
                  <div className='flex flex-col gap-1 px-4 pb-4'>
                    {[
                      { href: '/', label: '首页', icon: MessageSquare },
                      { href: '/categories', label: '分类' },
                      { href: '/tags', label: '标签' },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className='flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors'
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>

                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

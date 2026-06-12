import { Badge } from '@/components/ui/badge';
import UserBadge from '@/extensions/badges/components/Badge';
import { getRoleBadgeStyle } from '@/lib/roleColor';
import { cn } from '@/lib/utils';

/**
 * 单个角色 pill。有合法自定义颜色时用 GitHub label 风格（淡底+同色边框+同色文字），
 * 否则回退主题色。
 */
function RoleBadge({ role, className }) {
  const style = getRoleBadgeStyle(role);
  return (
    <Badge
      variant={style ? 'outline' : 'secondary'}
      className={cn(
        style ? 'border' : 'bg-primary/10 text-primary border-0',
        className
      )}
      style={style || undefined}
    >
      {role.name}
    </Badge>
  );
}

/**
 * 用户角色 Badge —— 展示用户的全部 displayRoles（按优先级降序，由后端排序）。
 * 兼容仅有单个 displayRole 的旧数据。
 * @param {Object} user - 含 displayRoles（数组）或 displayRole（单个）
 * @param {number} max - 最多展示的角色数，超出以 +N 收起（默认 3）
 * @param {string} badgeClassName - 应用到每个角色 pill 与 +N chip 的样式（如紧凑头部的尺寸）
 */
export function UserRoleBadge({ user, max = 3, className, badgeClassName }) {
  const roles =
    user?.displayRoles?.length
      ? user.displayRoles
      : user?.displayRole
        ? [user.displayRole]
        : [];

  if (roles.length === 0) return null;

  const shown = roles.slice(0, max);
  const overflow = roles.length - shown.length;

  return (
    <span className={cn('inline-flex items-center gap-1.5 flex-wrap', className)}>
      {shown.map((role) => (
        <RoleBadge key={role.slug} role={role} className={badgeClassName} />
      ))}
      {overflow > 0 && (
        <Badge
          variant='secondary'
          className={cn('bg-muted text-muted-foreground border-0', badgeClassName)}
        >
          +{overflow}
        </Badge>
      )}
    </span>
  );
}

/**
 * 勋章列表
 * @param {Array} badges - 勋章数据 (兼容 Badge object 或 UserBadge object)
 * @param {'md'|'lg'|'xl'} size - 勋章尺寸
 */
export function UserBadgesList({ badges = [], size = 'md', className }) {
  if (!badges || badges.length === 0) return null;
  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
      {badges.map((item) => {
        const badge = item.badge || item;
        return (
          <UserBadge
            key={badge.id || badge.slug}
            badge={badge}
            userBadge={item.badge ? item : null}
            size={size}
            className='transition-transform hover:scale-110'
          />
        );
      })}
    </div>
  );
}

/**
 * 用户身份组合行 — 角色 Badge + 勋章在同一行展示
 * 适用于横向布局的头部 (medium/twitter 模板)
 * UserCard 的垂直布局应直接使用 UserRoleBadge + UserBadgesList 各自渲染
 */
export default function UserIdentityBadges({
  user,
  badges = [],
  size = 'md',
  className,
}) {
  const hasRole = !!user?.displayRole;
  const hasBadges = badges && badges.length > 0;
  if (!hasRole && !hasBadges) return null;

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <UserRoleBadge user={user} />
      <UserBadgesList badges={badges} size={size} />
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 回复列表逻辑 Hook (useReplyList)
 * 管理回复列表数据、分页状态、滚动行为以及本地增删操作
 *
 * @param {Object} props - Hook 参数
 * @param {number} props.topicId - 话题ID
 * @param {Array} props.initialPosts - 初始回复列表
 * @param {number} props.totalPosts - 回复总数
 * @param {number} props.currentPage - 当前页码
 * @returns {Object} 包含列表状态和操作方法的对象
 */
export function useReplyList({
  topicId,
  initialPosts,
  totalPosts: initialTotalPosts,
  currentPage,
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [totalPosts, setTotalPosts] = useState(initialTotalPosts);
  const repliesContainerRef = useRef(null);
  const prevPageRef = useRef(currentPage);

  // 当服务端数据更新时（分页切换），更新本地状态
  useEffect(() => {
    if (initialPosts !== posts) {
        setPosts(initialPosts);
        setTotalPosts(initialTotalPosts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPosts, initialTotalPosts]);

  // 页码变化时滚动到顶部
  useEffect(() => {
    if (currentPage !== prevPageRef.current) {
        repliesContainerRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      prevPageRef.current = currentPage;
    }
  }, [currentPage]);

  /**
   * 处理页码切换
   * 通过更新 URL 参数来触发页面刷新
   * @param {number} page - 目标页码
   */
  const handlePageChange = (page) => {
    router.push(`/topic/${topicId}?p=${page}`, { scroll: false });
  };

  /**
   * 处理帖子被删除
   * 更新本地列表和总数
   * @param {number} postId - 被删除的帖子ID
   */
  const handlePostDeleted = (postId) => {
    setPosts((prevPosts) => prevPosts.filter((p) => p.id !== postId));
    setTotalPosts((prev) => Math.max(prev - 1, 0));
  };

  /**
   * 处理新回复添加
   * 将新回复追加到列表末尾，并增加总数
   * @param {Object} newPost - 新添加的回复对象
   */
  const handleReplyAdded = (newPost) => {
    setPosts((prevPosts) => [...prevPosts, newPost]);
    setTotalPosts((prev) => prev + 1);
  };

  // 供 useImperativeHandle 使用的 addPost
  const addPost = handleReplyAdded;

  return {
    /** 当前回复列表数据 */
    posts,
    /** 回复总数 */
    totalPosts,
    /** 列表容器 Ref */
    repliesContainerRef,
    /** 切换页码方法 */
    handlePageChange,
    /** 处理删除回调 */
    handlePostDeleted,
    /** 处理添加回调 */
    handleReplyAdded,
    /** 添加回复别名（供外部调用） */
    addPost,
  };
}

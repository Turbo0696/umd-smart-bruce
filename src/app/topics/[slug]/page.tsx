import { notFound } from "next/navigation";
import Image from "next/image";
import { getCurrentProfile } from "@/lib/auth";
import { getTopicWithPosts } from "@/lib/topics";
import { createPost } from "./actions";

// width/height must match each file's real aspect ratio, or the layout
// reserves the wrong shape and leaves visible empty space around it.
const TOPIC_BANNERS: Record<string, { src: string; width: number; height: number }> = {
  "decision-sciences": {
    src: "/images/bruce-ds-badge.png",
    width: 900,
    height: 453,
  },
  "supply-chain-management": {
    src: "/images/bruce-campus-banner.png",
    width: 900,
    height: 407,
  },
};

export default async function TopicPage(props: PageProps<"/topics/[slug]">) {
  const { slug } = await props.params;
  const [topic, profile] = await Promise.all([
    getTopicWithPosts(slug),
    getCurrentProfile(),
  ]);

  if (!topic) {
    notFound();
  }

  const canPost = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";
  const createPostForTopic = createPost.bind(null, slug);
  const banner = TOPIC_BANNERS[slug];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      {banner && (
        <Image
          src={banner.src}
          alt=""
          width={banner.width}
          height={banner.height}
          className="mb-6 h-auto w-full max-w-xs rounded-lg"
          priority
        />
      )}
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {topic.name}
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {topic.description}
      </p>

      {canPost && (
        <form
          action={createPostForTopic}
          className="mt-8 flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            New post
          </h2>
          <input
            name="title"
            placeholder="Title"
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
          />
          <textarea
            name="body"
            placeholder="Body"
            required
            rows={4}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" name="pinned" />
            Pin this post
          </label>
          <button
            type="submit"
            className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Post
          </button>
        </form>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {topic.posts.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            No posts yet.
          </p>
        )}
        {topic.posts.map((post) => (
          <article
            key={post.id}
            className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                {post.title}
              </h2>
              {post.pinned && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  Pinned
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              {post.author.name ?? post.author.email} ·{" "}
              {post.createdAt.toLocaleDateString()}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {post.body}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { getTopic, topics } from "@/lib/topics";

export function generateStaticParams() {
  return topics.map((topic) => ({ slug: topic.slug }));
}

export default async function TopicPage(
  props: PageProps<"/topics/[slug]">,
) {
  const { slug } = await props.params;
  const topic = getTopic(slug);

  if (!topic) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900">{topic.name}</h1>
      <p className="mt-2 text-zinc-600">{topic.description}</p>

      <div className="mt-8 flex flex-col gap-4">
        {topic.posts.map((post) => (
          <article
            key={post.slug}
            className="rounded-lg border border-zinc-200 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900">{post.title}</h2>
              {post.pinned && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                  Pinned
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">{post.date}</p>
            <p className="mt-3 text-sm text-zinc-700">{post.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeleteTutorButton } from "./DeleteTutorButton";
import { MaterialsManager } from "./MaterialsManager";
import { TutorChat } from "./TutorChat";

// Chat (sendMessage in ./actions.ts) chains an embeddings call and a
// chat-completion call against a university-run gateway that can be
// slow; give the route room so a merely-slow (not hung) upstream
// response isn't killed mid-flight by the platform default. This has
// to live here rather than in actions.ts — a "use server" file may
// only export async functions.
export const maxDuration = 60;

export default async function TutorPage(props: PageProps<"/tutor/[tutorTopicId]">) {
  const { tutorTopicId } = await props.params;
  const [tutor, profile] = await Promise.all([
    prisma.tutorTopic.findUnique({
      where: { id: tutorTopicId },
      include: {
        topic: true,
        course: { include: { enrollments: true } },
        materials: { orderBy: { createdAt: "desc" } },
      },
    }),
    getCurrentProfile(),
  ]);

  if (!tutor) {
    notFound();
  }

  const isAdmin = profile?.role === "ADMIN";
  const isCourseInstructor = !!profile && tutor.course?.instructorId === profile.id;
  const isEnrolled =
    !!profile && (tutor.course?.enrollments.some((e) => e.userId === profile.id) ?? false);
  const canManage =
    isAdmin ||
    isCourseInstructor ||
    (!tutor.courseId && (profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN"));
  const canChat = tutor.courseId ? isAdmin || isCourseInstructor || isEnrolled : !!profile;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="flex items-center gap-4">
        <Image
          src="/images/bruce-tutor.png"
          alt=""
          width={500}
          height={530}
          className="h-16 w-auto"
          priority
        />
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {tutor.name}
        </h1>
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {tutor.topic ? (
          <>
            Tutor for{" "}
            <Link href={`/topics/${tutor.topic.slug}`} className="underline">
              {tutor.topic.name}
            </Link>
          </>
        ) : (
          <>
            Tutor for{" "}
            <Link href={`/courses/${tutor.courseId}`} className="underline">
              {tutor.course?.name}
            </Link>
          </>
        )}
      </p>

      {canManage && <MaterialsManager tutorTopicId={tutor.id} materials={tutor.materials} />}

      {/* Deletion wipes chat history for every student on this tutor,
          not just the instructor's own materials — scoped to admins
          only, unlike the manage controls above. */}
      {isAdmin && <DeleteTutorButton tutorTopicId={tutor.id} tutorName={tutor.name} />}

      {!profile ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          Log in to chat with this tutor.
        </p>
      ) : !canChat ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          You need to join this course first.{" "}
          <Link href="/courses" className="underline">
            Go to Courses
          </Link>
        </p>
      ) : (
        <TutorChatSection tutorTopicId={tutor.id} userId={profile.id} />
      )}
    </div>
  );
}

async function TutorChatSection({
  tutorTopicId,
  userId,
}: {
  tutorTopicId: string;
  userId: string;
}) {
  const history = await prisma.chatMessage.findMany({
    where: { tutorTopicId, userId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <TutorChat
      tutorTopicId={tutorTopicId}
      initialMessages={history.map((m) => ({ role: m.role, content: m.content }))}
    />
  );
}

-- AlterTable
ALTER TABLE "discord_channels" ADD COLUMN     "postGoals" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "postUpdates" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "post_logs" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'wrap';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "goalPostTime" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "workUpdateTime" TEXT NOT NULL DEFAULT '18:00';

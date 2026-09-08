-- 프로필 사진. 카카오 계정 이미지를 기본값으로 두고, 직접 올린 사진이 있으면 그것을 우선한다.
ALTER TABLE "users"
  ADD COLUMN "kakao_profile_image_url" VARCHAR(500),
  ADD COLUMN "profile_image_object_ref" VARCHAR(500),
  ADD COLUMN "profile_image_content_type" VARCHAR(40),
  ADD COLUMN "profile_image_updated_at" TIMESTAMPTZ(6);

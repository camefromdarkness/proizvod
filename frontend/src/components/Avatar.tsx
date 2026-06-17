import type { User } from "../api";
import { avatarHue, getInitials } from "../utils/avatar";
import { fileURL } from "../utils/files";

type AvatarSize = "xs" | "sm" | "md" | "lg";

interface AvatarProps {
  user: Pick<User, "id" | "display_name" | "avatar_url">;
  size?: AvatarSize;
  className?: string;
}

const sizeClass: Record<AvatarSize, string> = {
  xs: "avatar-xs",
  sm: "avatar-sm",
  md: "",
  lg: "avatar-lg",
};

export default function Avatar({ user, size = "md", className = "" }: AvatarProps) {
  const classes = ["avatar", sizeClass[size], className].filter(Boolean).join(" ");
  const src = fileURL(user.avatar_url);

  if (src) {
    return <img alt={user.display_name} className={`${classes} avatar-image`} src={src} />;
  }

  return (
    <span className={classes} style={{ background: `hsl(${avatarHue(user.id)} 45% 45%)` }}>
      {getInitials(user.display_name)}
    </span>
  );
}

// Footer Component
import { UpdateInfo } from "../../services/updater";
import { Icons } from "../icons";

interface FooterProps {
  version: string;
  showSettings: boolean;
  updateInfo: UpdateInfo | null;
  onToggleSettings: () => void;
  onShowUpdate: () => void;
}

export function Footer({
  version,
  showSettings,
  updateInfo,
  onToggleSettings,
  onShowUpdate,
}: FooterProps) {
  return (
    <div className="stats-footer">
      <div className="footer-left">
        <button className="settings-toggle" onClick={onToggleSettings}>
          <span dangerouslySetInnerHTML={{ __html: Icons.settings }} />
          Settings
        </button>
        {updateInfo?.available && (
          <button className="footer-btn primary" onClick={onShowUpdate}>
            Update v{updateInfo.latestVersion}
          </button>
        )}
      </div>
      <span className="version-text">
        v{version} - ❤️ made with love by{" "}
        <a href="https://github.com/Xndr2/listening-stats">Xndr</a>
      </span>
    </div>
  );
}

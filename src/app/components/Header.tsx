export function Header() {
  return (
    <>
      <div className="stats-header">
        <h1 className="stats-title">Listening Stats</h1>
        <p className="stats-subtitle">Your personal music analytics</p>
        <p className="stats-dev-note">
          Dev note: Thanks for all the support!
          <br />I am working on a better tracking method but am running into
          heavy Spotify rate limits. A solution is being made but it's taking
          more time then I thought.
        </p>
      </div>
    </>
  );
}

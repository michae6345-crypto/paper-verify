/**
 * The line that has to be here until authentication is.
 *
 * `/login` takes an email and nothing else. There is no password, no provider,
 * no server, and no check that the address belongs to the person typing it. A
 * screen that looks like a sign-in while accepting anything is a claim the
 * product cannot support, and this product's entire argument is that it does not
 * make those. So the screen says what it is, on every page that uses it, rather
 * than once at the bottom of a settings page.
 *
 * It is persistent rather than dismissible for the same reason a verdict is not
 * dismissible. When real authentication lands, this component and its two
 * mounts in `AuthShell` are what gets deleted.
 */
export function NoAuthNotice() {
  return (
    <div
      role="note"
      style={{
        background: "var(--site-accent)",
        borderBottom: "1px solid var(--site-line)",
      }}
    >
      <div
        className="mx-auto w-full max-w-[1440px] py-2.5"
        style={{ paddingInline: "var(--site-gutter)" }}
      >
        <p
          style={{
            // #ffffff on #ff3700 is 3.9:1. Black is 8.6:1, and this line is the
            // one on the page that must not be skimmable past.
            color: "#000000",
            fontSize: "14px",
            fontWeight: 500,
            lineHeight: 1.5,
          }}
        >
          No authentication yet. Sessions are stored in this browser only, anyone can sign in as
          anyone, and nothing here is private or protected.
        </p>
      </div>
    </div>
  );
}

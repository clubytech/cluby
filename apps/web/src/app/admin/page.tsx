import { AdminToken } from "@/components/admin-token";
import { SectionHeading } from "@/components/ui";
import { deployments } from "@cluby/config";

/**
 * Not in the navigation, and not in an index.
 *
 * There is nothing secret here — the page can only ask the chain to do what the chain would let the
 * connected wallet do anyway, and every button ends in a transaction the owner signs. It is
 * unlisted because it is an operator's tool and its presence in search results would only ever
 * confuse a reader looking for the token.
 */
export const metadata = {
  title: "Admin — Cluby",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-14 pt-10">
          <SectionHeading align="left" title="Publish the token." />
          <p className="mt-4 max-w-2xl text-white/70">
            Paste the contract address once it exists. The site reads it from{" "}
            <span className="num break-all text-white/90">{deployments.tokenRegistry}</span> on the
            chain, so the ticker and the address appear the moment this transaction lands — no
            deploy, no cache to clear, and nothing that a password could change.
          </p>
        </div>
      </section>

      <section className="bg-bg-soft">
        <div className="container-padding py-14">
          <div className="mx-auto max-w-2xl">
            <AdminToken />
          </div>
        </div>
      </section>
    </>
  );
}

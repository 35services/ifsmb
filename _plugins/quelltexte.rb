# Publishes the unprocessed source of every page that has an edit form under /quelltext/<path in the repo>,
# e.g. /quelltext/_posts/2026-11-13-titel.md. "✏️ Bearbeiten" (_includes/bearbeiten-knopf.html, assets/js/neu.js)
# loads it on click to fill the form – from our own domain, no request to GitHub.
# The files are copied after the build (no Liquid, no layout) and are not part of site.static_files.
module IfsmbQuelltexte
  # collection → form type in assets/js/neu.js (same map as _includes/bearbeiten-knopf.html)
  SAMMLUNGEN = %w[posts events projects equipment herausforderungen team press].freeze

  Jekyll::Hooks.register :site, :post_write do |site|
    SAMMLUNGEN.each do |name|
      sammlung = site.collections[name]
      next unless sammlung

      sammlung.docs.each do |doc|
        ziel = File.join(site.dest, "quelltext", doc.relative_path)
        FileUtils.mkdir_p(File.dirname(ziel))
        FileUtils.cp(doc.path, ziel)
      end
    end
  end
end

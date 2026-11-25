# Tests for _plugins/federation_links.rb (resolving links to connected instances) – no network:
# FederationLinks.resolve is stubbed. Run: ruby _scripts/test_federation_links.rb
require "minitest/autorun"
require "minitest/mock"
begin
  require "jekyll"
rescue LoadError
  # outside Bundler: the plugin only needs Jekyll::Hooks.register, Jekyll.logger and Liquid::Template.register_filter
  module Jekyll
    module Hooks
      def self.register(*) = nil
    end
    def self.logger = Struct.new(:warn).new(nil)
  end
  module Liquid
    class Template
      def self.register_filter(*) = nil
    end
  end
end
require_relative "../_plugins/federation_links"

class FederationLinksTest < Minitest::Test
  URL = "https://35services.ifsmb.de/equipment/snapmaker-u1/"

  # the markup Falko sketched: visible content with itemprop, nested manufacturer item
  EXAMPLE = <<~HTML
    <article itemscope itemtype="https://schema.org/Product" itemid="#{URL}">
      <link itemprop="url" href="#{URL}" />
      <span itemprop="category">3D-Drucker</span>
      <h1 itemprop="name">Snapmaker U1 mit Einhausung von 35services</h1>
      <div itemprop="manufacturer" itemscope itemtype="https://schema.org/Organization">
        <a itemprop="url" href="https://snapmaker.com/"><span itemprop="name">Snapmaker</span></a>
      </div>
    </article>
  HTML

  # what _includes/microdata.html renders
  INCLUDE = <<~HTML
    <html><head><title>Snapmaker U1 – 35 services e. V.</title></head><body><h1>Snapmaker U1</h1>
    <div class="microdata" itemscope itemtype="https://schema.org/Product" itemid="#{URL}">
      <link itemprop="url" href="#{URL}">
      <meta itemprop="name" content="Snapmaker U1 mit Einhausung">
      <meta itemprop="identifier" content="2beec856-0000-4000-8000-000000000000">
    </div></body></html>
  HTML

  def test_parse_visible_microdata_ignores_nested_items
    r = FederationLinks.parse(EXAMPLE, URL)
    assert_equal "equipment", r[:type]
    assert_equal "Snapmaker U1 mit Einhausung von 35services", r[:name]
  end

  def test_parse_include_format
    r = FederationLinks.parse(INCLUDE, URL)
    assert_equal({ status: :ok, type: "equipment", name: "Snapmaker U1 mit Einhausung" }, r)
  end

  def test_parse_without_microdata_falls_back_to_title_without_type
    r = FederationLinks.parse(%(<html><head><meta property="og:title" content="Irgendwas"><title>X</title></head></html>), URL)
    assert_nil r[:type]
    assert_equal "Irgendwas", r[:name]
  end

  def test_unknown_schema_type_has_no_type
    r = FederationLinks.parse(%(<div itemscope itemtype="https://schema.org/Recipe" itemid="#{URL}"><meta itemprop="name" content="Kuchen"></div>), URL)
    assert_nil r[:type]
    assert_equal "Kuchen", r[:name]
  end

  def test_title_link_rule
    assert FederationLinks.title_link?("Snapmaker U1", "Snapmaker U1 mit Einhausung", URL)
    assert FederationLinks.title_link?(URL, "Snapmaker U1 mit Einhausung", URL)
    refute FederationLinks.title_link?("3D-Druck AG an der KTG", "Snapmaker U1 mit Einhausung", URL)
    refute FederationLinks.title_link?("U1", "Snapmaker U1 mit Einhausung", URL) # too short to count as a copy
    # own words around the name stay (found on 35services.ifsmb.de)
    refute FederationLinks.title_link?("Spenden für die AG", "Spenden", URL)
    refute FederationLinks.title_link?("Pressemitteilung: Schulstadtrat zu Besuch", "Schulstadtrat zu Besuch", URL)
  end

  # --- rewrite with a stubbed resolve ---
  Site = Struct.new(:config, :data)

  def site
    Site.new({ "federation" => ["https://35services.ifsmb.de"] }, { "i18n" => { "de" => { "federation" => { "missing" => "nicht mehr vorhanden" } } } })
  end

  def with_resolve(result)
    FederationLinks.stub(:resolve, result) { yield }
  end

  def test_rewrite_title_link_gets_current_name_type_and_title
    out = with_resolve({ status: :ok, type: "equipment", name: "Snapmaker U1 mit Einhausung" }) do
      FederationLinks.rewrite(%(<p>Der <a href="#{URL}">Snapmaker U1</a> druckt.</p>), site)
    end
    assert_includes out, %(class="fed-link fed-equipment")
    assert_includes out, %(data-fed-type="equipment")
    assert_includes out, %(data-fed-fallback="Snapmaker U1")
    assert_includes out, ">Snapmaker U1 mit Einhausung</a>"
    assert_includes out, %(title="Snapmaker U1 mit Einhausung – 35services.ifsmb.de")
  end

  def test_rewrite_keeps_words_of_other_links
    out = with_resolve({ status: :ok, type: "equipment", name: "Snapmaker U1 mit Einhausung" }) do
      FederationLinks.rewrite(%(<a href="#{URL}">3D-Druck AG an der KTG</a>), site)
    end
    assert_includes out, ">3D-Druck AG an der KTG</a>"
    refute_includes out, "data-fed-title"
  end

  def test_rewrite_missing_page
    out = with_resolve({ status: :missing }) { FederationLinks.rewrite(%(<a href="#{URL}">Snapmaker U1</a>), site) }
    assert_includes out, %(class="fed-link fed-missing")
    assert_includes out, %(<span class="fed-hinweis" data-i18n="federation.missing">(nicht mehr vorhanden)</span>)
  end

  def test_rewrite_generated_link_gets_icon_and_name
    out = with_resolve({ status: :ok, type: "person", name: "Anton" }) do
      FederationLinks.rewrite(%(<a class="fed-auto" href="https://35services.ifsmb.de/team/anton/"><span aria-hidden="true">🌐</span> 35services.ifsmb.de/team/anton/</a>), site)
    end
    assert_includes out, %(<span aria-hidden="true">👤</span> Anton</a>)
  end

  def test_rewrite_escapes_names_from_other_instances
    out = with_resolve({ status: :ok, type: nil, name: %(<img src=x onerror=alert(1)>Snapmaker U1) }) do
      FederationLinks.rewrite(%(<a href="#{URL}">#{URL}</a>), site)
    end
    refute_includes out, "<img"
    assert_includes out, "&lt;img"
  end

  def test_rewrite_section_link_gets_no_name_or_type
    out = with_resolve({ status: :ok, type: "partner", name: "Partner" }) do
      FederationLinks.rewrite(%(<a href="https://35services.ifsmb.de/partners/#ktg">Kurt-Tucholsky-Grundschule</a>), site)
    end
    assert_equal %(<a href="https://35services.ifsmb.de/partners/#ktg" class="fed-link">Kurt-Tucholsky-Grundschule</a>), out
    gone = with_resolve({ status: :missing }) { FederationLinks.rewrite(%(<a href="https://35services.ifsmb.de/partners/#ktg">KTG</a>), site) }
    assert_includes gone, "fed-missing"
  end

  # --- filter federation_resolve (sorts links into the group of their type in _includes/verbindungen.html) ---
  class FilterHost
    include FederationLinks::Filter
    def initialize(site) = @context = Struct.new(:registers).new({ site: site })
  end

  def test_filter_gives_type_name_and_host
    f = with_resolve({ status: :ok, type: "equipment", name: "Snapmaker U1 mit Einhausung" }) { FilterHost.new(site).federation_resolve(URL) }
    assert_equal({ "url" => URL, "short" => "35services.ifsmb.de/equipment/snapmaker-u1/", "host" => "35services.ifsmb.de",
                   "status" => "ok", "type" => "equipment", "name" => "Snapmaker U1 mit Einhausung" }, f)
  end

  def test_filter_other_hosts_and_sections
    assert_equal "other", FilterHost.new(site).federation_resolve("https://example.org/x/")["status"]
    f = with_resolve({ status: :ok, type: "partner", name: "Partner" }) { FilterHost.new(site).federation_resolve("https://35services.ifsmb.de/partners/#ktg") }
    assert_equal "unknown", f["status"]
  end

  # --- filter external_link (`links: [{ title, url, category }]`) ---
  def test_external_link_uses_title_and_category_without_fetching
    f = FederationLinks.stub(:resolve, ->(*) { flunk "external links are not fetched" }) do
      FilterHost.new(site).external_link({ "title" => "Sicherheit an der Drehmaschine", "url" => "https://35services.de/2026/x/", "category" => "post" })
    end
    assert_equal ["external", "post", "Sicherheit an der Drehmaschine", "35services.de"], f.values_at("status", "type", "name", "host")
    i = FilterHost.new(site).external_link({ "title" => "Unser Beitrag", "url" => "https://www.instagram.com/p/abc/", "category" => "link" })
    assert_equal "link", i["type"]
    assert_nil FilterHost.new(site).external_link({ "url" => "https://x.org/", "category" => "<script>" })["type"]
  end

  def test_external_link_on_a_connected_instance_prefers_its_microdata
    entry = { "title" => "Alter Name", "url" => URL, "category" => "post" }
    f = with_resolve({ status: :ok, type: "equipment", name: "Snapmaker U1 mit Einhausung" }) { FilterHost.new(site).external_link(entry) }
    assert_equal ["ok", "equipment", "Snapmaker U1 mit Einhausung"], f.values_at("status", "type", "name")
    g = with_resolve({ status: :unknown }) { FilterHost.new(site).external_link(entry) }
    assert_equal ["unknown", "post", "Alter Name"], g.values_at("status", "type", "name") # fallback copy
  end

  def test_rewrite_ignores_other_hosts_and_network_errors
    html = %(<a href="https://example.org/x/">x</a>)
    assert_equal html, FederationLinks.rewrite(html, site)
    out = with_resolve({ status: :unknown }) { FederationLinks.rewrite(%(<a href="#{URL}">Snapmaker U1</a>), site) }
    assert_equal %(<a href="#{URL}" class="fed-link">Snapmaker U1</a>), out
  end
end

# frozen_string_literal: true

# Tests for _plugins/instanz.rb (several sites from one code base): overrides from _data/instanz/ and {% ifpage %}.
#   ruby _scripts/test_instanz.rb   (läuft in „Prüfen“)
require "minitest/autorun"
require "jekyll"
require_relative "../_plugins/instanz"

class InstanzTest < Minitest::Test
  FakeSite = Struct.new(:data, :pages, :documents)
  FakePage = Struct.new(:url) do
    def write? = true
  end

  def site(data, urls = [])
    FakeSite.new(data, urls.map { |u| FakePage.new(u) }, [])
  end

  def test_i18n_keys_are_replaced_one_by_one
    s = site({ "i18n" => { "de" => { "footer" => { "disclaimer" => "Alt", "donate" => "Spenden" }, "n" => { "one" => "{n} Ding", "other" => "{n} Dinge" } } },
               "instanz" => { "i18n" => { "de" => { "footer" => { "disclaimer" => "Neu" }, "n" => { "one" => "{n} Sache", "other" => "{n} Sachen" } } } } })
    Instanz.apply(s)
    assert_equal({ "disclaimer" => "Neu", "donate" => "Spenden" }, s.data["i18n"]["de"]["footer"])
    assert_equal "{n} Sachen", s.data["i18n"]["de"]["n"]["other"]
  end

  def test_unknown_i18n_key_stops_the_build
    s = site({ "i18n" => { "de" => { "footer" => { "disclaimer" => "Alt" } } },
               "instanz" => { "i18n" => { "de" => { "footer" => { "disclamer" => "Tippfehler" } } } } })
    err = assert_raises(Jekyll::Errors::FatalException) { Instanz.apply(s) }
    assert_match(/footer\.disclamer/, err.message)
  end

  def test_placeholders_must_stay
    s = site({ "i18n" => { "de" => { "a" => "Hallo {name}" } }, "instanz" => { "i18n" => { "de" => { "a" => "Hallo" } } } })
    assert_raises(Jekyll::Errors::FatalException) { Instanz.apply(s) }
  end

  def test_other_data_lists_are_replaced_hashes_merged
    s = site({ "themes" => [{ "id" => "a" }, { "id" => "b" }], "tags" => { "x" => "X", "y" => "Y" },
               "instanz" => { "themes" => [{ "id" => "c" }], "tags" => { "y" => "Ypsilon" } } })
    Instanz.apply(s)
    assert_equal [{ "id" => "c" }], s.data["themes"]
    assert_equal({ "x" => "X", "y" => "Ypsilon" }, s.data["tags"])
  end

  def test_without_instanz_nothing_changes
    data = { "i18n" => { "de" => { "a" => "b" } } }
    s = site(Marshal.load(Marshal.dump(data)))
    Instanz.apply(s)
    assert_equal data, s.data
  end

  def render(template, urls)
    s = site({}, urls)
    Instanz.reset(s)
    Liquid::Template.parse(template).render!({}, registers: { site: s })
  end

  def test_ifpage_and_unlesspage
    t = "{% ifpage /spenden/ %}L{% endifpage %}{% unlesspage /spenden/ %}T{% endunlesspage %}"
    assert_equal "L", render(t, ["/spenden/", "/"])
    assert_equal "T", render(t, ["/"])
    assert_equal "L", render("{% ifpage /spenden %}L{% endifpage %}", ["/spenden/"]), "ohne Schrägstrich am Ende"
    assert_equal "L", render("{% ifpage '/impressum/#theme-wahl' %}L{% endifpage %}", ["/impressum/"]), "Anker zählt nicht"
  end
end
